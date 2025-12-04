(function () {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const latestListEl = document.getElementById("latestList");
  let chartInstance;

  function showError(message) {
    errorEl.textContent = message;
  }

  function setLoading(message) {
    loadingEl.textContent = message;
  }

  function clearStatus() {
    loadingEl.textContent = "";
    errorEl.textContent = "";
  }

  function formatDateLabel(dateStr) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }

  function colorForIndex(index) {
    const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0891b2", "#d97706"];
    return palette[index % palette.length];
  }

  function renderLatest(entries) {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const latestByName = new Map();

    sorted.forEach((entry) => {
      const name = entry.name || entry.article;
      if (!latestByName.has(name)) {
        latestByName.set(name, entry);
      }
    });

    if (!latestByName.size) {
      latestListEl.innerHTML = "<p>No documents found yet.</p>";
      return;
    }

    latestListEl.innerHTML = "";

    latestByName.forEach((entry, name) => {
      const percent =
        entry.percent_change === null || entry.percent_change === undefined
          ? "—"
          : `${entry.percent_change.toFixed(2)}%`;

      const card = document.createElement("div");
      card.className = "latest-item";
      card.innerHTML = `
        <div>
          <p class="label">${name.replace(/_/g, " ")}</p>
          <p class="date">${formatDateLabel(entry.date)}</p>
        </div>
        <div class="metric">
          <p class="views">${entry.views.toLocaleString()} views</p>
          <p class="change">${percent} vs prev. day</p>
        </div>
      `;

      latestListEl.appendChild(card);
    });
  }

  function renderChart(entries) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const labelsRaw = Array.from(new Set(sorted.map((entry) => entry.date))).sort();
    const labels = labelsRaw.map(formatDateLabel);
    const grouped = {};

    sorted.forEach((entry) => {
      const name = entry.name || entry.article;
      if (!grouped[name]) {
        grouped[name] = {};
      }
      grouped[name][entry.date] = entry.percent_change ?? null;
    });

    const datasets = Object.entries(grouped).map(([name, dateMap], idx) => ({
      label: name.replace(/_/g, " "),
      data: labelsRaw.map((dateKey) => dateMap[dateKey] ?? null),
      borderColor: colorForIndex(idx),
      backgroundColor: colorForIndex(idx),
      spanGaps: true,
      tension: 0.2,
    }));

    const ctx = document.getElementById("percentChangeChart");

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          title: { display: true, text: "Percent change vs previous day" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label || "";
                const value = ctx.parsed.y;
                if (value === null || value === undefined) {
                  return `${label}: no previous day`;
                }
                return `${label}: ${value.toFixed(2)}%`;
              },
            },
          },
          legend: { position: "bottom" },
        },
        scales: {
          y: {
            title: { display: true, text: "% change" },
            ticks: { callback: (value) => `${value}%` },
          },
        },
      },
    });
  }

  async function bootstrap() {
    if (typeof firebaseConfig === "undefined") {
      showError("Missing firebase-config.js. Copy firebase-config.example.js and fill your keys.");
      return;
    }

    try {
      setLoading("Connecting to Firestore…");
      const app = firebase.initializeApp(firebaseConfig);
      const db = firebase.firestore(app);
      setLoading("Loading documents…");
      const snapshot = await db.collection("daily_stats").orderBy("date").get();
      const entries = snapshot.docs.map((doc) => doc.data());
      if (!entries.length) {
        showError("No documents found yet. Run the tracker to populate Firestore.");
        return;
      }
      clearStatus();
      renderChart(entries);
      renderLatest(entries);
    } catch (err) {
      console.error(err);
      showError(`Could not load data: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  bootstrap();
})();
