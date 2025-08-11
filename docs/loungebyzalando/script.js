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
const topPhrasesNeg2El = document.getElementById('top-phrases-neg-2');
const topPhrasesPos2El = document.getElementById('top-phrases-pos-2');
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
    updateTopWords(filtered, 'negative', topWordsNegEl, 'word-link');
    updateTopWords(filtered, 'positive', topWordsPosEl, 'word-link-pos');
    
    // Update phrases (bigrams only)
    updateTopPhrases(filtered, 'negative', topPhrasesNeg2El, 'word-link', 2);
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
