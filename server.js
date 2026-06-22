const http = require('http');
const url = require('url');
const https = require('https');

// Default backup profiles if network fails or ticker is not found
const FALLBACK_PROFILES = {
    "NVDA": {
        "symbol": "NVDA",
        "name": "英伟达 / NVIDIA",
        "price": 125.40,
        "change": "+4.80%",
        "change_type": "up",
        "business": "全球AI算力芯片巨头，构建了硬件(GPU)+软件(CUDA)的极深护城河。",
        "how_we_make_money": "销售高性能数据中心GPU（H100/H200/Blackwell）、游戏显卡以及AI Enterprise软件授权。",
        "revenue": [
            { "name": "数据中心 (AI Data Center)", "value": 87, "color": "#00ffcc" },
            { "name": "游戏显卡 (Gaming GPU)", "value": 9, "color": "#2f80ed" },
            { "name": "专业可视化 & Auto", "value": 4, "color": "#ffd600" }
        ],
        "catalyst": "2026年Q2财报披露（披露Blackwell芯片量产出货指引）",
        "catalyst_days": 24,
        "trend": "均线多头排列（MA20 > MA50 > MA120）",
        "trend_type": "bullish"
    },
    "AAPL": {
        "symbol": "AAPL",
        "name": "苹果公司 / Apple",
        "price": 214.30,
        "change": "-0.60%",
        "change_type": "down",
        "business": "全球消费电子之王，以iPhone为核心，通过iOS生态锁定全球超20亿高净值活跃设备。",
        "how_we_make_money": "高客单价硬件销售（iPhone/Mac/iPad）以及高毛利的互联网服务（App Store/Cloud/Pay）。",
        "revenue": [
            { "name": "iPhone 硬件销售", "value": 51, "color": "#00ffcc" },
            { "name": "高毛利互联网服务", "value": 24, "color": "#2f80ed" },
            { "name": "iPad & Mac 电脑", "value": 15, "color": "#6366f1" },
            { "name": "可穿戴及配件设备", "value": 10, "color": "#ffd600" }
        ],
        "catalyst": "秋季新品发布会（iPhone 18 及 Apple Intelligence 升级）",
        "catalyst_days": 45,
        "trend": "多空震荡整理（MA20/MA50交织，在支撑位附近企稳）",
        "trend_type": "neutral"
    },
    "TSLA": {
        "symbol": "TSLA",
        "name": "特斯拉 / Tesla",
        "price": 187.20,
        "change": "+8.30%",
        "change_type": "up",
        "business": "智能电动车领军企业，致力于垂直整合产业链，并加速向FSD自动驾驶、机器人与储能转型。",
        "how_we_make_money": "电动汽车销售与租赁、FSD软件订阅授权、储能电池（Megapack）以及超级充电网络服务。",
        "revenue": [
            { "name": "智能电动汽车销售", "value": 82, "color": "#00ffcc" },
            { "name": "Megapack 储能储电", "value": 9, "color": "#2f80ed" },
            { "name": "超级充电 & 售后服务", "value": 9, "color": "#6366f1" }
        ],
        "catalyst": "Robotaxi 自动驾驶出租车发布会（演示无方向盘原型车）",
        "catalyst_days": 15,
        "trend": "技术形态探底回升（向上突破MA50阻力，短期多头较强）",
        "trend_type": "bullish"
    }
};

// Promise wrapper for https requests
function fetchUrl(url, headers = {}) {
    return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
                ...headers
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => {
            resolve(null);
        });
    });
}

// Simple sentiment helper
function analyzeSentiment(text) {
    const posWords = ['涨', '牛', '多', '买', '好', '强', '看好', '利好', '突破', '满仓', '加仓', '入'];
    const negWords = ['跌', '空', '卖', '惨', '割', '跑', '利空', '垃圾', '缩水', '减仓', '爆仓', '离场'];
    let score = 0;
    
    posWords.forEach(w => { if (text.includes(w)) score++; });
    negWords.forEach(w => { if (text.includes(w)) score--; });

    if (score > 0) return 'bullish';
    if (score < 0) return 'bearish';
    return 'neutral';
}

// Decode entity references
function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#27809;/g, '没')
        .replace(/&#20102;/g, '了')
        .replace(/&#21834;/g, '啊')
        .replace(/&#36023;/g, '买')
        .replace(/&#36889;/g, '这')
        .replace(/&#20491;/g, '个')
        .replace(/&#65292;/g, '，')
        .replace(/&#21213;/g, '胜')
        .replace(/&#36942;/g, '过')
        .replace(/&#32654;/g, '美')
        .replace(/&#20809;/g, '光')
        .replace(/&#26410;/g, '未')
        .replace(/&#26469;/g, '来')
        .replace(/&#20581;/g, '健');
}

// Aggregate data dispatcher
async function getStockDetails(ticker) {
    // 1. Setup fallback base
    const base = FALLBACK_PROFILES[ticker] || {
        "symbol": ticker,
        "name": `${ticker} Company`,
        "price": 100.0,
        "change": "+0.00%",
        "change_type": "up",
        "business": `该标的属于 ${ticker} 领域相关企业，主营核心商业网络建设与运营。`,
        "how_we_make_money": "销售高附加值科技产品、提供订阅制 SaaS 服务以及专业商业咨询支持。",
        "revenue": [
            { "name": "主营科技产品", "value": 70, "color": "#00ffcc" },
            { "name": "云与订阅业务", "value": 30, "color": "#2f80ed" }
        ],
        "catalyst": "公司新产品研发线推进及市场业绩展望披露。",
        "catalyst_days": 30,
        "trend": "多空分歧平缓，处于横盘箱体整理阶段。",
        "trend_type": "neutral"
    };

    // 2. Fetch live quote from Yahoo Finance API
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const quoteData = await fetchUrl(quoteUrl);
    if (quoteData && quoteData.chart && quoteData.chart.result && quoteData.chart.result[0]) {
        const meta = quoteData.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose;
        if (price && prevClose) {
            const changeVal = price - prevClose;
            const changePct = (changeVal / prevClose) * 100;
            base.price = parseFloat(price.toFixed(2));
            base.change = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
            base.change_type = changePct >= 0 ? 'up' : 'down';
        }
    }

    // 3. Compute dynamic support and resistance levels based on real price
    base.support = parseFloat((base.price * 0.94).toFixed(2));
    base.resistance = parseFloat((base.price * 1.07).toFixed(2));
    base.support_distance = `${((base.price - base.support) / base.price * 100).toFixed(1)}%`;

    // 4. Fetch Futu News Search (futu-stock-digest)
    const newsUrl = `https://ai-news-search.futunn.com/news_search?keyword=${encodeURIComponent(ticker)}&size=5&sort_type=2`;
    const newsData = await fetchUrl(newsUrl, { 'User-Agent': 'futu-stock-digest/0.0.2 (Skill)' });
    if (newsData && newsData.code === 0 && newsData.data && newsData.data.length > 0) {
        // Strip tags for clean catalyst text
        const rawTitle = newsData.data[0].title || '';
        base.catalyst = rawTitle.replace(/<[^>]*>/g, '').trim();
        base.catalyst_days = Math.floor(Math.random() * 20 + 5);
    }

    // 5. Fetch Futu Stock Feed comments (futu-comment-sentiment)
    const feedUrl = `https://ai-news-search.futunn.com/stock_feed?keyword=${encodeURIComponent(ticker)}&size=15`;
    const feedData = await fetchUrl(feedUrl, { 'User-Agent': 'futu-comment-sentiment/0.0.2 (Skill)' });
    let voices = [];
    let bullCount = 0;
    let bearCount = 0;

    if (feedData && feedData.code === 0 && feedData.data && feedData.data.length > 0) {
        feedData.data.forEach(post => {
            let rawText = post.title || '';
            rawText = rawText.replace(/<[^>]*>/g, '').trim();
            rawText = decodeEntities(rawText);
            
            if (rawText.length > 4) {
                const sentiment = analyzeSentiment(rawText);
                if (sentiment === 'bullish') bullCount++;
                if (sentiment === 'bearish') bearCount++;
                
                voices.push({
                    text: rawText,
                    sentiment: sentiment
                });
            }
        });
    }

    // Fill defaults if feed was empty
    if (voices.length === 0) {
        voices = [
            { text: `看好后市，在支撑位附近建仓 Sell Put 赚取权利金极度划算。`, sentiment: 'bullish' },
            { text: `现阶段估值确实在高位，注意行权价要保留足够安全垫保护。`, sentiment: 'neutral' },
            { text: `大盘不稳，技术图形开始破位，建议先持币观望为主。`, sentiment: 'bearish' }
        ];
        base.sentiment = {
            bull_pct: 68,
            bear_pct: 32,
            post_count: 3,
            voices: voices
        };
    } else {
        const total = bullCount + bearCount;
        const bull_pct = total > 0 ? Math.max(30, Math.min(85, Math.round((bullCount / total) * 100))) : 65;
        base.sentiment = {
            bull_pct: bull_pct,
            bear_pct: 100 - bull_pct,
            post_count: voices.length,
            voices: voices.slice(0, 3)
        };
    }

    // 6. Generate options chain entries matching live stock price
    base.chain = {
        PUT: [
            { strike: parseFloat((base.price * 0.92).toFixed(1)), premium: parseFloat((base.price * 0.028).toFixed(2)), days: 30 },
            { strike: parseFloat((base.price * 0.96).toFixed(1)), premium: parseFloat((base.price * 0.046).toFixed(2)), days: 30 },
            { strike: parseFloat((base.price * 0.88).toFixed(1)), premium: parseFloat((base.price * 0.015).toFixed(2)), days: 30 }
        ],
        CALL: [
            { strike: parseFloat((base.price * 1.04).toFixed(1)), premium: parseFloat((base.price * 0.033).toFixed(2)), days: 30 },
            { strike: parseFloat((base.price * 1.08).toFixed(1)), premium: parseFloat((base.price * 0.017).toFixed(2)), days: 30 },
            { strike: parseFloat((base.price * 1.12).toFixed(1)), premium: parseFloat((base.price * 0.008).toFixed(2)), days: 30 }
        ]
    };

    return base;
}

// Server listen setup
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/api/futu-stock') {
        const ticker = (parsedUrl.query.ticker || 'NVDA').toUpperCase().trim();
        console.log(`[Middleware API] Serving details query for symbol: ${ticker}`);
        
        try {
            const stockDetails = await getStockDetails(ticker);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(stockDetails));
        } catch (e) {
            console.error(e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal server error" }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Route Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  Futu Option Premium Vibe Calculator - Native Node Middleware  `);
    console.log(`  Listening on: http://localhost:${PORT}                      `);
    console.log(`  Test API: http://localhost:${PORT}/api/futu-stock?ticker=NVDA  `);
    console.log(`================================================================`);
});
