// --- STATE ---
let selectedPlatform = 'all';

// --- UTILITY FUNCTIONS ---
const formatNumber = (n) => n.toLocaleString();

// --- DOM ELEMENTS ---
const summaryEl = document.getElementById('summary');
const scoreSummaryEl = document.getElementById('score-summary');
const crossTabEl = document.getElementById('cross-tab');
const topWordsNegEl = document.getElementById('top-words-neg');
const topWordsPosEl = document.getElementById('top-words-pos');
const commentsTitleEl = document.getElementById('comments-title');
const commentsTableEl = document.getElementById('comments-table');
const commentsTbodyEl = commentsTableEl.getElementsByTagName('tbody')[0];
const platformTabsEl = document.getElementById('platformTabs');
const yearSliderEl = document.getElementById('yearRangeSlider');
const sliderValuesEl = document.getElementById('sliderValues');

// --- UPDATE FUNCTIONS ---
function updateSummary(filtered) {
    const total = filtered.length;
    const avg = total ? (filtered.reduce((a, b) => a + (parseFloat(b.sentiment_raw) || 0), 0) / total) : 0;
    const pos = total ? filtered.filter(r => r.sentiment_type === 'positive').length / total * 100 : 0;
    const neg = total ? filtered.filter(r => r.sentiment_type === 'negative').length / total * 100 : 0;
    const neu = total ? filtered.filter(r => r.sentiment_type === 'neutral').length / total * 100 : 0;
    summaryEl.innerHTML = `<span><b>Total reviews:</b> ${formatNumber(total)}</span><span><b>Average sentiment:</b> ${avg.toFixed(2)}</span><span><b>% Positive:</b> ${pos.toFixed(1)}%</span><span><b>% Neutral:</b> ${neu.toFixed(1)}%</span><span><b>% Negative:</b> ${neg.toFixed(1)}%</span>`;
}

function updateStarTable(filtered) {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    filtered.forEach(r => { if (counts.hasOwnProperty(r.score)) counts[r.score]++; });
    let html = '<table><tr><th>Stars</th><th>Count</th></tr>';
    for (let i = 5; i >= 1; i--) {
        html += `<tr><td>${i}</td><td>${formatNumber(counts[i])}</td></tr>`;
    }
    html += '</table>';
    scoreSummaryEl.innerHTML = html;
}

function updateCrossTab(filtered) {
    const sentiments = ['positive', 'neutral', 'negative'];
    const scores = [5, 4, 3, 2, 1];
    let table = '<table class="cross-tab"><tr><th>Stars</th>';
    sentiments.forEach(s => table += `<th>${s.charAt(0).toUpperCase() + s.slice(1)}</th>`);
    table += '</tr>';
    scores.forEach(score => {
        table += `<tr><td>${score}</td>`;
        sentiments.forEach(sent => {
            const count = filtered.filter(r => r.score === score && r.sentiment_type === sent).length;
            table += `<td>${formatNumber(count)}</td>`;
        });
        table += '</tr>';
    });
    table += '</table>';
    crossTabEl.innerHTML = table;
}

function updateTopWords(filtered, sentimentType, element, linkClass) {
    let allText = filtered.filter(r => r.sentiment_type === sentimentType).map(r => r.review ? r.review.toLowerCase() : '').join(' ');
    allText = allText.replace(/[^a-z\s]/g, '');
    let words = allText.split(/\s+/).filter(w => w && !stopWords.has(w) && w.length > 2);
    let counts = {};
    words.forEach(w => counts[w] = (counts[w] || 0) + 1);
    let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    let html = '<table><tr><th>Word</th><th>Count</th></tr>';
    sorted.forEach(([word, count]) => {
        html += `<tr><td><a href="#" class="${linkClass}" data-word="${word}">${word}</a></td><td>${formatNumber(count)}</td></tr>`;
    });
    html += '</table>';
    element.innerHTML = html;
}

function updateCommentsTable(comments, wordFilter = null) {
    commentsTbodyEl.innerHTML = '';
    if (!comments.length) {
        commentsTableEl.style.display = 'none';
        commentsTitleEl.style.display = 'none';
        return;
    }

    comments.slice(0, 20).forEach(row => {
        const newRow = commentsTbodyEl.insertRow();
        let reviewText = row.review || '';
        if (wordFilter) {
            const re = new RegExp(`\\b(${wordFilter})\\b`, 'gi');
            reviewText = reviewText.replace(re, '<b>$1</b>');
        }
        const sentimentClass = row.sentiment_type === 'positive' ? 'sentiment-pos' : (row.sentiment_type === 'negative' ? 'sentiment-neg' : 'sentiment-neu');
        newRow.innerHTML = `
            <td>${row.score}</td>
            <td class="${sentimentClass}">${row.sentiment}</td>
            <td>${reviewText}</td>
            <td>${row.date}</td>
        `;
    });
    commentsTableEl.style.display = '';
    commentsTitleEl.style.display = '';
}

function getFilteredData() {
    return allComments.filter(r => {
        const yearMatch = r.year >= yearStart && r.year <= yearEnd;
        const platformMatch = selectedPlatform === 'all' || r.platform === selectedPlatform;
        return yearMatch && platformMatch;
    });
}

function mainUpdate(wordFilter = null, sentimentType = null) {
    const filtered = getFilteredData();
    updateSummary(filtered);
    updateStarTable(filtered);
    updateCrossTab(filtered);
    updateTopWords(filtered, 'negative', topWordsNegEl, 'word-link');
    updateTopWords(filtered, 'positive', topWordsPosEl, 'word-link-pos');

    if (wordFilter && sentimentType) {
        const wordRegex = new RegExp(`\\b${wordFilter}\\b`, 'i');
        let commentsToShow = filtered.filter(row => {
            const sentimentMatch = row.sentiment_type === sentimentType;
            const wordMatch = row.words && wordRegex.test(row.words);
            const wordCount = (row.review || '').trim().split(/\s+/).length >= 10;
            return sentimentMatch && wordMatch && wordCount;
        });
        
        // Sort by date descending
        commentsToShow.sort((a, b) => new Date(b.date) - new Date(a.date));

        commentsTitleEl.innerText = `Top ${commentsToShow.length > 20 ? 20 : commentsToShow.length} ${sentimentType} comments containing "${wordFilter}"`;
        updateCommentsTable(commentsToShow, wordFilter);
    } else {
        commentsTableEl.style.display = 'none';
        commentsTitleEl.style.display = 'none';
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('word-link')) {
        e.preventDefault();
        mainUpdate(e.target.dataset.word, 'negative');
    }
    if (e.target.classList.contains('word-link-pos')) {
        e.preventDefault();
        mainUpdate(e.target.dataset.word, 'positive');
    }
});

function renderPlatformFilter() {
    let html = `<button class="platform-tab active" data-platform="all">Show All</button>`;
    platforms.forEach(p => {
        html += `<button class="platform-tab" data-platform="${p}">${p}</button>`;
    });
    platformTabsEl.innerHTML = html;
    platformTabsEl.querySelectorAll('.platform-tab').forEach(btn => {
        btn.addEventListener('click', function() {
            platformTabsEl.querySelector('.active').classList.remove('active');
            this.classList.add('active');
            selectedPlatform = this.dataset.platform;
            mainUpdate(); // Re-render everything without a word filter
        });
    });
}

// --- INITIALIZATION ---
noUiSlider.create(yearSliderEl, {
    start: [yearStart, yearEnd],
    connect: true,
    step: 1,
    range: { min: yearStart, max: yearEnd },
    tooltips: [true, true],
    format: { to: v => Math.round(v), from: v => Math.round(v) }
});

yearSliderEl.noUiSlider.on('update', function(values) {
    [yearStart, yearEnd] = values.map(v => parseInt(v));
    sliderValuesEl.innerText = `${yearStart} - ${yearEnd}`;
    mainUpdate(); // Re-render everything without a word filter
});

renderPlatformFilter();
mainUpdate();
