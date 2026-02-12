const headers = { 'User-Agent': 'OSRS-Flip-Finder-Enzo' };

// Global State
let myChart = null;
let allItems = []; // Stores the full processed list of items

// --- 1. INITIALIZATION ---
async function init() {
    const listDiv = document.getElementById('item-list');
    listDiv.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Fetching latest market data...</div>';

    try {
        // Fetch all 3 endpoints concurrently for speed
        const [latestRes, volumeRes, mapRes] = await Promise.all([
            fetch('https://prices.runescape.wiki/api/v1/osrs/latest', { headers }),
            fetch('https://prices.runescape.wiki/api/v1/osrs/24h', { headers }),
            fetch('https://prices.runescape.wiki/api/v1/osrs/mapping', { headers })
        ]);

        const latest = (await latestRes.json()).data;
        const volumes = (await volumeRes.json()).data;
        const mapping = await mapRes.json();

        // Merge Data & Calculate Metrics
        allItems = mapping.map(item => {
            const live = latest[item.id];
            const day = volumes[item.id];

            // Filter out items with missing data
            if (!live || !live.high || !live.low || !day) return null;

            // --- FLIPPING MATH ---
            const margin = live.high - live.low;
            // Tax is 1%, capped at 5,000,000 gp
            const tax = Math.min(5000000, Math.floor(live.high * 0.01));
            const profit = margin - tax;
            // ROI = (Profit / Investment) * 100
            const roi = (profit / live.low) * 100;
            const volume = (day.highPriceVolume || 0) + (day.lowPriceVolume || 0);

            return {
                id: item.id,
                name: item.name,
                priceHigh: live.high, // Instant Buy Price
                priceLow: live.low,   // Instant Sell Price
                volume: volume,
                highTime: live.highTime,
                limit: item.limit || null, // GE Buy Limit (e.g., 10000)
                tax: tax,
                profit: profit,
                roi: roi,
                potential: item.limit ? (profit * item.limit) : 0 // Max profit per 4 hours
            };
        }).filter(item => item !== null); // Remove nulls

        // Initial Render
        applyFilters();

    } catch (e) {
        listDiv.innerHTML = '<div style="color:red; text-align:center;">Error loading API. Check console.</div>';
        console.error("API Error:", e);
    }
}

// --- 2. FILTERING LOGIC ---
function applyFilters() {
    // Get values from HTML inputs
    const minProfit = parseInt(document.getElementById('min-profit').value) || 0;
    const minRoi = parseFloat(document.getElementById('min-roi').value) || 0;
    const maxPrice = parseInt(document.getElementById('max-price').value) || 2147000000;
    const minVol = parseInt(document.getElementById('min-volume').value) || 0;
    const searchTerm = document.getElementById('search-input').value.toLowerCase();

    // Time check: Ignore items not traded in the last 2 hours (7200 seconds)
    const now = Math.floor(Date.now() / 1000);

    const filtered = allItems.filter(item => {
        // Text Search
        if (!item.name.toLowerCase().includes(searchTerm)) return false;

        // Value Filters
        if (item.profit < minProfit) return false;
        if (item.roi < minRoi) return false;
        if (item.priceHigh > maxPrice) return false;
        if (item.volume < minVol) return false;

        // Stale Data Check
        if (now - item.highTime > 7200) return false;

        return true;
    }).sort((a, b) => b.profit - a.profit); // Sort by Highest Profit first

    renderList(filtered);
}

// --- 3. LIST RENDERING ---
function renderList(items) {
    const listDiv = document.getElementById('item-list');

    // Limit to 50 items for performance
    const displayItems = items.slice(0, 50);

    if (displayItems.length === 0) {
        listDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No items found matching filters.</div>';
        return;
    }

    listDiv.innerHTML = displayItems.map(item => `
        <div class="item-card" onclick="showDetails(${item.id})">
            <img src="https://static.runelite.net/cache/item/icon/${item.id}.png" style="width:32px; height:32px; object-fit:contain;">
            <div style="flex-grow:1;">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${item.name}</strong>
                    <span style="color:#00e676; font-weight:bold;">+${simplify(item.profit)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.85em; color:#888; margin-top:2px;">
                    <span>ROI: ${item.roi.toFixed(1)}%</span>
                    <span>Vol: ${simplify(item.volume)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// --- 4. DETAIL VIEW ---
function showDetails(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    // Update Header
    document.getElementById('item-title').innerText = item.name;
    document.getElementById('item-subtitle').innerText = `GE Limit: ${item.limit ? item.limit.toLocaleString() : 'Unknown'}`;

    const icon = document.getElementById('detail-icon');
    icon.src = `https://static.runelite.net/cache/item/icon/${item.id}.png`;
    icon.style.display = 'block';

    // Render 6-Card Stat Grid
    document.getElementById('flip-stats').innerHTML = `
        <div class="stat-card" style="border-top-color: #00e676;">
            <span class="stat-label">NET PROFIT (Per Item)</span>
            <div class="stat-value" style="color:#00e676;">${item.profit.toLocaleString()} gp</div>
        </div>
        <div class="stat-card" style="border-top-color: #2979ff;">
            <span class="stat-label">ROI %</span>
            <div class="stat-value" style="color:#2979ff;">${item.roi.toFixed(2)}%</div>
        </div>
        <div class="stat-card" style="border-top-color: #ff5252;">
            <span class="stat-label">TAX PAID (1%)</span>
            <div class="stat-value" style="color:#ff5252;">-${item.tax.toLocaleString()} gp</div>
        </div>

        <div class="stat-card" style="border-top-color: #ff9800;">
            <span class="stat-label">BUY PRICE (Low)</span>
            <div class="stat-value">${item.priceLow.toLocaleString()} gp</div>
        </div>
        <div class="stat-card" style="border-top-color: #ff9800;">
            <span class="stat-label">SELL PRICE (High)</span>
            <div class="stat-value">${item.priceHigh.toLocaleString()} gp</div>
        </div>
        <div class="stat-card" style="border-top-color: #9c27b0;">
            <span class="stat-label">POTENTIAL 4H PROFIT</span>
            <div class="stat-value" style="color:#e0e0e0;">${item.limit ? simplify(item.potential) : '?'}</div>
        </div>
    `;

    // Fetch and render the graph
    fetchHistory(id, item.name);
}

// --- 5. GRAPH RENDERING ---
async function fetchHistory(id, name) {
    try {
        const res = await fetch(`https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=24h&id=${id}`, { headers });
        const history = await res.json();

        // Take last 30 data points
        const dataPoints = history.data.slice(-30);

        renderChart(
            dataPoints.map(d => new Date(d.timestamp * 1000).toLocaleDateString()),
            dataPoints.map(d => d.avgHighPrice),
            name
        );
    } catch (e) {
        console.error("Graph Error:", e);
    }
}

function renderChart(labels, data, name) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    // Destroy old chart to prevent "glitching" effects
    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Avg Sell Price',
                data: data,
                borderColor: '#ff9800',
                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.raw.toLocaleString() + ' gp';
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: '#333' },
                    ticks: { color: '#888' }
                },
                x: {
                    grid: { display: false },
                    ticks: { display: false }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// --- 6. UTILITIES ---
function simplify(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'b';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'm';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toLocaleString();
}

// --- 7. EVENT LISTENERS ---
// Re-filter when any input changes
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', applyFilters);
    input.addEventListener('keyup', applyFilters); // For search bar
});

// Start the app
init();
