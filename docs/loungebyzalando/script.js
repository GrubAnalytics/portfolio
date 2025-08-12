// --- STATE ---
let selectedPlatform = 'all';

// --- UTILITY FUNCTIONS ---
const formatNumber = (n) => n.toLocaleString();

// --- DOM ELEMENTS ---
const summaryEl = document.getElementById('summary');
const scoreSummaryEl = document.getElementById('score-summary');
const crossTabEl = document.getElementById('cross-tab');
const topWordsNegEl = document.getElementById('top-words-neg');
const topWordsNeuEl = document.getElementById('top-words-neu');
const topWordsPosEl = document.getElementById('top-words-pos');
const topPhrasesNeg2El = document.getElementById('top-phrases-neg-2');
const topPhrasesNeu2El = document.getElementById('top-phrases-neu-2');
const topPhrasesPos2El = document.getElementById('top-phrases-pos-2');
const commentsTitleEl = document.getElementById('comments-title');
const commentsTableEl = document.getElementById('comments-table');
const commentsTbodyEl = commentsTableEl.getElementsByTagName('tbody')[0];
const platformTabsEl = document.getElementById('platformTabs');
const yearSliderEl = document.getElementById('yearRangeSlider');
const sliderValuesEl = document.getElementById('sliderValues');
const sentimentHistogramEl = document.getElementById('sentiment-histogram');

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

function updateSentimentHistogram(filtered) {
    if (!sentimentHistogramEl) return;
    
    // Create bins for histogram (20 bins from -1 to 1)
    const bins = [];
    const binCount = 20;
    const binSize = 2 / binCount; // Range from -1 to 1
    
    for (let i = 0; i < binCount; i++) {
        bins.push({
            min: -1 + (i * binSize),
            max: -1 + ((i + 1) * binSize),
            count: 0
        });
    }
    
    // Count sentiment scores in each bin
    filtered.forEach(review => {
        const sentiment = review.sentiment_raw;
        if (sentiment != null) {
            const binIndex = Math.min(Math.floor((sentiment + 1) / binSize), binCount - 1);
            bins[binIndex].count++;
        }
    });
    
    // Find max count for scaling
    const maxCount = Math.max(...bins.map(b => b.count));
    
    // Create histogram HTML
    let html = '';
    bins.forEach((bin, i) => {
        const height = maxCount > 0 ? (bin.count / maxCount) * 180 : 0; // Max 180px height
        const left = (i / binCount) * 100;
        const width = (1 / binCount) * 100;
        
        // Color based on position
        let color = '#ffc107'; // neutral (yellow)
        if (bin.max < -0.12) color = '#d63384'; // negative (red)
        else if (bin.min > 0.61) color = '#198754'; // positive (green)
        
        // Show count if significant
        const showCount = bin.count > 0 && height > 20;
        const countLabel = showCount ? `<div style="position: absolute; top: -15px; width: 100%; text-align: center; font-size: 9px; color: #333;">${bin.count}</div>` : '';
        
        html += `<div style="position: absolute; bottom: 0; left: ${left}%; width: ${width}%; height: ${height}px; background-color: ${color}; border: 1px solid #fff; box-sizing: border-box;" title="Range: ${bin.min.toFixed(2)} to ${bin.max.toFixed(2)}, Count: ${bin.count}">${countLabel}</div>`;
    });
    
    // Add boundary lines
    const negBoundaryPos = ((-0.12 + 1) / 2) * 100; // Convert -0.12 to percentage
    const posBoundaryPos = ((0.61 + 1) / 2) * 100; // Convert 0.61 to percentage
    
    html += `<div style="position: absolute; left: ${negBoundaryPos}%; top: 0; bottom: 0; width: 2px; background-color: #dc3545; opacity: 0.8;" title="Negative/Neutral Boundary: -0.12"></div>`;
    html += `<div style="position: absolute; left: ${posBoundaryPos}%; top: 0; bottom: 0; width: 2px; background-color: #198754; opacity: 0.8;" title="Neutral/Positive Boundary: 0.61"></div>`;
    
    sentimentHistogramEl.innerHTML = html;
}

function updateTopWords(filtered, sentimentType, element, linkClass) {
    const relevantComments = filtered.filter(r => r.sentiment_type === sentimentType);
    let wordCounts = {};
    
    // Count unique comments containing each canonical word
    relevantComments.forEach(comment => {
        let reviewText = comment.review ? comment.review.toLowerCase() : '';
        let cleanText = reviewText.replace(/[^a-z\s]/g, '');
        let words = cleanText.split(/\s+/).filter(w => w && !stopWords.has(w) && w.length > 2);
        let uniqueCanonicals = new Set(words.map(getCanonicalWord));
        uniqueCanonicals.forEach(canonical => {
            wordCounts[canonical] = (wordCounts[canonical] || 0) + 1;
        });
    });
    let sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    let html = '<table><tr><th>Word</th><th>Count</th></tr>';
    sorted.forEach(([word, count]) => {
        html += `<tr><td><a href="#" class="${linkClass}" data-word="${word}">${word}</a></td><td>${formatNumber(count)}</td></tr>`;
    });
    html += '</table>';
    element.innerHTML = html;
}

function updateTopPhrases(filtered, sentimentType, element, linkClass, ngramSize = 2) {
    const relevantComments = filtered.filter(r => r.sentiment_type === sentimentType);
    let phraseCounts = {};
    relevantComments.forEach(comment => {
        let reviewText = comment.review ? comment.review.toLowerCase() : '';
        let cleanText = reviewText.replace(/[^a-z\s]/g, '');
        let words = cleanText.split(/\s+/).filter(w => w && !stopWords.has(w) && w.length > 2);
        let phrases = [];
        for (let i = 0; i <= words.length - ngramSize; i++) {
            let phrase = words.slice(i, i + ngramSize).join(' ');
            phrases.push(getCanonicalPhrase(phrase));
        }
        let uniqueCanonicals = new Set(phrases);
        uniqueCanonicals.forEach(canonical => {
            phraseCounts[canonical] = (phraseCounts[canonical] || 0) + 1;
        });
    });
    let sorted = Object.entries(phraseCounts)
        .filter(([phrase, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    let html = `<table><tr><th>${ngramSize === 2 ? 'Top Phrases (2 words)' : 'Top Phrases (3 words)'}</th><th>Count</th></tr>`;
    sorted.forEach(([phrase, count]) => {
        html += `<tr><td><a href="#" class="${linkClass}" data-word="${phrase}">${phrase}</a></td><td>${formatNumber(count)}</td></tr>`;
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

    comments.forEach(row => {
        const newRow = commentsTbodyEl.insertRow();
        let reviewText = row.review || '';
        if (wordFilter) {
            // For highlighting, we need to be smarter about matching processed words/phrases
            if (!wordFilter.includes(' ')) {
                // Single word - use word boundary regex
                const re = new RegExp(`\\b(${wordFilter})\\b`, 'gi');
                reviewText = reviewText.replace(re, '<b>$1</b>');
            } else {
                // For phrases, we need to find the original words in the text
                const phraseWords = wordFilter.split(' ');
                let tempText = reviewText;
                
                // Try to highlight each word in the phrase
                phraseWords.forEach(word => {
                    const re = new RegExp(`\\b(${word})\\b`, 'gi');
                    tempText = tempText.replace(re, '<b>$1</b>');
                });
                reviewText = tempText;
            }
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
    updateSentimentHistogram(filtered);
    updateTopWords(filtered, 'negative', topWordsNegEl, 'word-link');
    updateTopWords(filtered, 'neutral', topWordsNeuEl, 'word-link-neu');
    updateTopWords(filtered, 'positive', topWordsPosEl, 'word-link-pos');

    // Update phrases (bigrams only)
    updateTopPhrases(filtered, 'negative', topPhrasesNeg2El, 'word-link', 2);
    updateTopPhrases(filtered, 'neutral', topPhrasesNeu2El, 'word-link-neu', 2);
    updateTopPhrases(filtered, 'positive', topPhrasesPos2El, 'word-link-pos', 2);

    if (wordFilter && sentimentType) {
        const canonicalFilter = getCanonicalPhrase(wordFilter);
        let commentsToShow = filtered.filter(row => {
            const sentimentMatch = row.sentiment_type === sentimentType;
            let reviewText = (row.review ? row.review.toLowerCase() : '').replace(/[^a-z\s]/g, '');
            let words = reviewText.split(/\s+/).filter(w => w && !stopWords.has(w) && w.length > 2);
            if (!wordFilter.includes(' ')) {
                // Single word: match canonical
                return sentimentMatch && words.map(getCanonicalWord).includes(canonicalFilter);
            } else {
                // Phrase: match canonical phrase
                return sentimentMatch && phraseInComment(canonicalFilter, words);
            }
        });
        // Sort by date descending
        commentsToShow.sort((a, b) => new Date(b.date) - new Date(a.date));
        commentsTitleEl.innerText = `All ${commentsToShow.length} ${sentimentType} comments containing "${wordFilter}"`;
        updateCommentsTable(commentsToShow, wordFilter);
    } else {
        commentsTableEl.style.display = 'none';
        commentsTitleEl.style.display = 'none';
    }
}

// --- SMART MATCH HELPERS ---
function getCanonicalWord(word) {
    // Simple de-pluralization: 'services' -> 'service', but not 'business', 'class', etc.
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

function getCanonicalPhrase(phrase) {
    // Canonicalize each word in the phrase
    return phrase.split(' ').map(getCanonicalWord).join(' ');
}

function phraseInComment(canonicalPhrase, commentWords) {
    // Returns true if the canonical phrase appears as consecutive canonical words in commentWords
    const phraseWords = canonicalPhrase.split(' ');
    for (let i = 0; i <= commentWords.length - phraseWords.length; i++) {
        let match = true;
        for (let j = 0; j < phraseWords.length; j++) {
            if (getCanonicalWord(commentWords[i + j]) !== phraseWords[j]) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }
    return false;
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
    if (e.target.classList.contains('word-link-neu')) {
        e.preventDefault();
        mainUpdate(e.target.dataset.word, 'neutral');
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

// Custom tooltips below the slider handles
noUiSlider.create(yearSliderEl, {
    start: [yearStart, yearEnd],
    connect: true,
    step: 1,
    range: { min: yearStart, max: yearEnd },
    tooltips: [{
        to: v => `<span style='display:block; margin-top:8px;'>${Math.round(v)}</span>`,
        from: v => Math.round(v)
    }, {
        to: v => `<span style='display:block; margin-top:8px;'>${Math.round(v)}</span>`,
        from: v => Math.round(v)
    }],
    format: { to: v => Math.round(v), from: v => Math.round(v) }
});

yearSliderEl.noUiSlider.on('update', function(values) {
    [yearStart, yearEnd] = values.map(v => parseInt(v));
    sliderValuesEl.innerText = `${yearStart} - ${yearEnd}`;
    mainUpdate(); // Re-render everything without a word filter
});

renderPlatformFilter();
mainUpdate();
