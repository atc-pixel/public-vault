(function () {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const latestListEl = document.getElementById("latestList");

  let chartInstance;
  let viewsMAChartInstance;

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
    // "20240101" -> "2024-01-01"
    if (!dateStr || dateStr.length !== 8) return dateStr || "";
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }

  function colorForIndex(index) {
    const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0891b2", "#d97706"];
    return palette[index % palette.length];
  }

  function renderLatest(entries) {
    // En yeni tarihten geriye doğru sırala
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const latestByName = new Map();

    sorted.forEach((entry) => {
      const name = entry.name || entry.article || "Unknown";
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
      // Güvenli percent_change
      const hasNumericPercent = typeof entry.percent_change === "number";
      const percent = hasNumericPercent ? `${entry.percent_change.toFixed(2)}%` : "—";

      // Güvenli views
      const rawViews = entry.views;
      const viewsValue = typeof rawViews === "number" ? rawViews : 0;
      const viewsLabel = viewsValue.toLocaleString();

      const card = document.createElement("div");
      card.className = "latest-item";
      card.innerHTML = `
        <div>
          <p class="label">${name.replace(/_/g, " ")}</p>
          <p class="date">${formatDateLabel(entry.date)}</p>
        </div>
        <div class="metric">
          <p class="views">${viewsLabel} views</p>
          <p class="change">${percent} vs prev. day</p>
        </div>
      `;

      latestListEl.appendChild(card);
    });
  }

  function renderChart(entries) {
    const ctx = document.getElementById("percentChangeChart");
    if (!ctx) return;

    // Tarihleri kronolojik sırada etiket olarak çıkar
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const labelsRaw = Array.from(new Set(sorted.map((entry) => entry.date))).sort();
    const labels = labelsRaw.map(formatDateLabel);

    // Kişi -> (tarih -> percent_change) map'i
    const grouped = {};

    sorted.forEach((entry) => {
      const name = entry.name || entry.article || "Unknown";
      if (!grouped[name]) {
        grouped[name] = {};
      }
      // Null/undefined percent_change boş bırakılır
      grouped[name][entry.date] =
        typeof entry.percent_change === "number" ? entry.percent_change : null;
    });

    const datasets = Object.entries(grouped).map(([name, dateMap], idx) => ({
      label: name.replace(/_/g, " "),
      data: labelsRaw.map((dateKey) => dateMap[dateKey] ?? null),
      borderColor: colorForIndex(idx),
      backgroundColor: colorForIndex(idx),
      spanGaps: true,
      tension: 0.2
    }));

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
              label: (tooltipItem) => {
                const label = tooltipItem.dataset.label || "";
                const value = tooltipItem.parsed.y;
                if (value === null || value === undefined) {
                  return `${label}: no previous day`;
                }
                return `${label}: ${value.toFixed(2)}%`;
              }
            }
          },
          legend: { position: "bottom" }
        },
        scales: {
          y: {
            title: { display: true, text: "% change" },
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        },
        elements: {
          line: {
            borderWidth: 1.5,
            tension: 0.2
          },
          point: {
            radius: 2,
            hitRadius: 6,
            hoverRadius: 4
          }
        }
      }
    });
  }

  function renderViewsMAChart(entries) {
    const ctx = document.getElementById("viewsMAChart");
    if (!ctx) return;

    // Tarihleri kronolojik sırada etiket olarak çıkar
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const labelsRaw = Array.from(new Set(sorted.map((entry) => entry.date))).sort();
    const labels = labelsRaw.map(formatDateLabel);

    // Kişi -> (tarih -> views) map'i
    const groupedViews = {};

    sorted.forEach((entry) => {
      const name = entry.name || entry.article || "Unknown";
      if (!groupedViews[name]) {
        groupedViews[name] = {};
      }
      if (typeof entry.views === "number") {
        groupedViews[name][entry.date] = entry.views;
      }
    });

    // 7 günlük hareketli ortalama hesapla
    const datasets = Object.entries(groupedViews).map(([name, dateMap], idx) => {
      const values = labelsRaw.map((_, idxLabel) => {
        const start = idxLabel - 6; // 7 günlük pencere
        if (start < 0) return null;

        let sum = 0;
        let count = 0;
        for (let i = start; i <= idxLabel; i++) {
          const v = dateMap[labelsRaw[i]];
          if (typeof v === "number") {
            sum += v;
            count++;
          }
        }

        if (!count) return null;
        return sum / count;
      });

      return {
        label: name.replace(/_/g, " "),
        data: values,
        borderColor: colorForIndex(idx),
        backgroundColor: colorForIndex(idx),
        spanGaps: true,
        tension: 0.2
      };
    });

    if (viewsMAChartInstance) {
      viewsMAChartInstance.destroy();
    }

    viewsMAChartInstance = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          title: { display: true, text: "7-day average daily views" },
          tooltip: {
            callbacks: {
              label: (tooltipItem) => {
                const label = tooltipItem.dataset.label || "";
                const value = tooltipItem.parsed.y;
                if (value === null || value === undefined) {
                  return `${label}: not enough data`;
                }
                return `${label}: ${Math.round(value).toLocaleString()} views`;
              }
            }
          },
          legend: { position: "bottom" }
        },
        scales: {
          y: {
            title: { display: true, text: "Views (7-day avg)" },
            ticks: {
              callback: (value) => Math.round(value).toLocaleString()
            }
          }
        },
        elements: {
          line: {
            borderWidth: 1.5,
            tension: 0.2
          },
          point: {
            radius: 0,
            hitRadius: 6,
            hoverRadius: 3
          }
        }
      }
    });
  }

  async function bootstrap() {
    if (typeof firebaseConfig === "undefined") {
      showError(
        "Missing firebase-config.js. Copy firebase-config.example.js and fill your keys."
      );
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
      renderViewsMAChart(entries);
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
