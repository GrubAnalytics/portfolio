import os
import psycopg2
import pandas as pd
from dotenv import load_dotenv
from textblob.en.sentiments import PatternAnalyzer
import re
from collections import Counter
import nltk
import datetime
import json as pyjson

# =====================
# 1. DATA PREPARATION
# =====================

def get_data():
    dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
    load_dotenv(dotenv_path=dotenv_path)
    conn = psycopg2.connect(
        host=os.getenv('PGHOST'),
        port=os.getenv('PGPORT'),
        dbname=os.getenv('PGDATABASE'),
        user=os.getenv('PGUSER'),
        password=os.getenv('PGPASSWORD')
    )
    query = """
    SELECT score, translated_content, review_date, platform
    FROM zalando_reviews
    WHERE translated_content IS NOT NULL AND translated_content != ''
    ORDER BY review_date DESC;
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    df['review_date'] = pd.to_datetime(df['review_date'])
    if 'translated_content' in df.columns:
        analyzer = PatternAnalyzer()
        df['sentiment_raw'] = df['translated_content'].apply(lambda text: analyzer.analyze(str(text)).polarity if pd.notnull(text) else None)
        df['sentiment'] = df['sentiment_raw'].map(lambda x: f"{x:.2f}" if pd.notnull(x) else "")
    if 'sentiment_raw' in df.columns:
        def sentiment_type(score):
            if score > 0.15:
                return 'positive'
            elif score < -0.15:
                return 'negative'
            else:
                return 'neutral'
        df['sentiment_type'] = df['sentiment_raw'].apply(sentiment_type)
    return df

def get_top_words(df, sentiment_type, stop_words, n=10):
    sub_df = df[df['sentiment_type'] == sentiment_type]
    all_text = ' '.join(sub_df['translated_content']).lower()
    all_text = re.sub(r'[^a-z\s]', '', all_text)
    words = [word for word in all_text.split() if word not in stop_words and len(word) > 2]
    word_counts = Counter(words)
    return word_counts.most_common(n)

def get_all_comments(df):
    all_comments = []
    for row in df.itertuples(index=False):
        content = row.translated_content
        if content is not None and not (isinstance(content, float) and pd.isna(content)):
            words = str(content).lower()
        else:
            words = ''
        date_val = row.review_date
        date_str = ''
        year_val = None
        if isinstance(date_val, (pd.Timestamp, datetime.datetime, datetime.date)):
            if not pd.isna(date_val):
                date_str = date_val.strftime('%Y-%m-%d')
                year_val = date_val.year
        elif isinstance(date_val, str):
            try:
                parsed = pd.to_datetime(date_val)
                if not pd.isna(parsed):
                    date_str = parsed.strftime('%Y-%m-%d')
                    year_val = parsed.year
            except Exception:
                date_str = date_val
                year_val = None
        all_comments.append({
            'score': row.score,
            'sentiment': row.sentiment,
            'sentiment_raw': row.sentiment_raw,
            'sentiment_type': row.sentiment_type,
            'review': content,
            'date': date_str,
            'year': year_val,
            'words': words,
            'platform': getattr(row, 'platform', 'unknown')
        })
    return all_comments

# =====================
# 2. HTML/JS TEMPLATES
# =====================

def build_html(min_year, max_year, score_summary_html, cross_tab_html, top_words_html, top_words_pos_html, all_comments, platforms):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Zalando Lounge Reviews Report</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.css" />
    <style>
        body {{ font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 0; }}
        .container {{ max-width: 1200px; margin: 40px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #0001; padding: 32px; }}
        h1 {{ color: #222; }}
        .summary {{ margin-bottom: 32px; }}
        .summary span {{ display: inline-block; margin-right: 32px; font-size: 1.1em; }}
        .flex-row {{ display: flex; gap: 40px; margin-bottom: 32px; }}
        .flex-row > div {{ flex: 1; }}
        table {{ border-collapse: collapse; width: 100%; background: #fff; }}
        th, td {{ padding: 10px 8px; text-align: left; }}
        th {{ background: #222; color: #fff; }}
        tr:nth-child(even) {{ background: #f2f2f2; }}
        .sentiment-pos {{ color: #228B22; font-weight: bold; }}
        .sentiment-neg {{ color: #B22222; font-weight: bold; }}
        .sentiment-neu {{ color: #888; }}
        .cross-tab th, .cross-tab td {{ border: 1px solid #ccc; }}
        .word-link {{ color: #0074d9; text-decoration: underline; cursor: pointer; }}
        .word-link:hover {{ color: #B22222; }}
        .year-slider {{ margin-bottom: 48px; font-size: 1.1em; }}
        .slider-labels {{ display: flex; justify-content: space-between; font-size: 1em; margin-top: 4px; }}
        .slider-values {{ margin-left: 12px; font-weight: bold; }}
        .slider-container {{ display: flex; align-items: center; gap: 12px; }}
        #yearRangeSlider {{ width: 320px; margin: 0 16px; }}
        .platform-tabs {{ display: flex; justify-content: center; gap: 16px; margin-bottom: 32px; }}
        .platform-tab {{ padding: 10px 28px; border-radius: 6px 6px 0 0; background: #ececf6; color: #333; cursor: pointer; font-weight: 500; border: none; outline: none; transition: background 0.2s; }}
        .platform-tab.active {{ background: #2d72d9; color: #fff; }}
    </style>
</head>
<body>
<div class="container">
    <h1>Zalando Lounge Reviews Report</h1>
    <div class="platform-tabs" id="platformTabs"></div>
    <div class="year-slider">
        <label><b>Filter by year range:</b></label><br><br><br>
        <div class="slider-container">
            <div id="yearRangeSlider"></div>
            <span class="slider-values" id="sliderValues">{min_year} - {max_year}</span>
        </div>
    </div>
    <div class="summary" id="summary"></div>
    <div class="flex-row">
        <div>
            <h2>Star Rating Summary</h2>
            <div id="score-summary"></div>
        </div>
        <div>
            <h2>Score vs. Sentiment Type</h2>
            <div id="cross-tab"></div>
        </div>
    </div>
    <div class="flex-row">
        <div style="flex:1;">
            <h2>Top Words in Negative Reviews</h2>
            <div id="word-instructions-neg" style="margin-bottom:12px;color:#555;font-size:1em;">
                <em>Click a word to see the top negative comments containing it. The word will be highlighted in the comments.</em>
            </div>
            <div id="top-words"></div>
        </div>
        <div style="flex:1;">
            <h2>Top Words in Positive Reviews</h2>
            <div id="word-instructions-pos" style="margin-bottom:12px;color:#555;font-size:1em;">
                <em>Click a word to see the top positive comments containing it. The word will be highlighted in the comments.</em>
            </div>
            <div id="top-words-pos"></div>
        </div>
    </div>
    <h2 id="comments-title" style="display:none;">Top 20 Most Negative Comments</h2>
    <table id="comments-table" style="display:none;">
        <thead>
            <tr>
                <th>Score</th>
                <th>Sentiment</th>
                <th>Review</th>
                <th style="width:120px;">Date</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {{
const allComments = {pyjson.dumps(all_comments)};
const platforms = {pyjson.dumps(platforms)};
let yearStart = {min_year};
let yearEnd = {max_year};
let selectedPlatform = null;

function renderPlatformFilter(selected = null) {{
    const container = document.getElementById('platformTabs');
    let html = '<button class="platform-tab' + (selected===null?' active':'') + '" data-platform="all">Show All</button>';
    platforms.forEach(function(p) {{
        html += `<button class="platform-tab${{selected===p?' active':''}}" data-platform="${{p}}">${{p}}</button>`;
    }});
    container.innerHTML = html;
    container.querySelectorAll('.platform-tab').forEach(btn => {{
        btn.addEventListener('click', function() {{
            container.querySelectorAll('.platform-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            let plat = this.getAttribute('data-platform');
            plat = (plat === 'all') ? null : plat;
            selectedPlatform = plat;
            // Only update data, don't show table unless a word was previously clicked
            const currentlyVisible = document.getElementById('comments-table').style.display !== 'none';
            updateAll();
            if (!currentlyVisible) {{
                document.getElementById('comments-table').style.display = 'none';
                document.getElementById('comments-title').style.display = 'none';
            }}
        }});
    }});
}}

function getFiltered() {{
    let filtered = allComments.filter(r => r.year !== null && r.year >= yearStart && r.year <= yearEnd);
    if (selectedPlatform) {{
        filtered = filtered.filter(r => r.platform === selectedPlatform);
    }}
    return filtered;
}}

function formatNumber(n) {{
    return n.toLocaleString();
}}

function updateSummary(filtered) {{
    const total = filtered.length;
    const avg = filtered.length ? (filtered.reduce((a, b) => a + (parseFloat(b.sentiment_raw)||0), 0) / filtered.length) : 0;
    const pos = filtered.filter(r => parseFloat(r.sentiment_raw) > 0.15).length / (filtered.length||1) * 100;
    const neg = filtered.filter(r => parseFloat(r.sentiment_raw) < -0.15).length / (filtered.length||1) * 100;
    const neu = filtered.filter(r => parseFloat(r.sentiment_raw) >= -0.15 && parseFloat(r.sentiment_raw) <= 0.15).length / (filtered.length||1) * 100;
    document.getElementById('summary').innerHTML = `<span><b>Total reviews:</b> ${{formatNumber(total)}}</span><span><b>Average sentiment:</b> ${{avg.toFixed(2)}}</span><span><b>% Positive:</b> ${{pos.toFixed(1)}}%</span><span><b>% Neutral:</b> ${{neu.toFixed(1)}}%</span><span><b>% Negative:</b> ${{neg.toFixed(1)}}%</span>`;
}}

function updateStarTable(filtered) {{
    const counts = {{}};
    for (let i = 1; i <= 5; i++) counts[i] = 0;
    filtered.forEach(r => {{
        if (r.score && counts.hasOwnProperty(r.score)) counts[r.score]++;
    }});
    let html = '<table><tr><th>Stars</th><th>Count</th></tr>';
    for (let i = 5; i >= 1; i--) {{
        html += `<tr><td>${{i}}</td><td>${{counts[i]}}</td></tr>`;
    }}
    html += '</table>';
    document.getElementById('score-summary').innerHTML = html;
}}

function updateCrossTab(filtered) {{
    // Build a cross-tab of score vs sentiment_type
    const sentiments = ['positive','neutral','negative'];
    const scores = [5,4,3,2,1];
    let table = '<table class="cross-tab"><tr><th>Stars</th>';
    sentiments.forEach(s => table += `<th>${{s.charAt(0).toUpperCase()+s.slice(1)}}</th>`);
    table += '</tr>';
    scores.forEach(score => {{
        table += `<tr><td>${{score}}</td>`;
        sentiments.forEach(sent => {{
            const count = filtered.filter(r => r.score === score && r.sentiment_type === sent).length;
            table += `<td>${{count}}</td>`;
        }});
        table += '</tr>';
    }});
    table += '</table>';
    document.getElementById('cross-tab').innerHTML = table;
}}

function updateTopWords(filtered, sentimentType, id, wordClass) {{
    // Get top 10 words for the sentimentType
    const stopWords = new Set({pyjson.dumps(list(set(nltk.corpus.stopwords.words('english')).union({'app','zalando','lounge','use','get'})))});
    let allText = filtered.filter(r => r.sentiment_type === sentimentType).map(r => r.review ? r.review.toLowerCase() : '').join(' ');
    allText = allText.replace(/[^a-z\\s]/g, '');
    let words = allText.split(/\\s+/).filter(w => w && !stopWords.has(w) && w.length > 2);
    let counts = {{}};
    words.forEach(w => counts[w] = (counts[w]||0)+1);
    let sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
    let html = `<table id="${{id}}" style="margin-bottom:24px;"><tr><th>Word</th><th>Count</th></tr>`;
    sorted.forEach(([word, count]) => {{
        html += `<tr><td><a href="#" class="${{wordClass}}" data-word="${{word}}">${{word}}</a></td><td>${{formatNumber(count)}}</td></tr>`;
    }});
    html += '</table>';
    document.getElementById(id).innerHTML = html;
}}

function updateAll(wordFilter = null, sentimentType = 'negative') {{
    const filtered = getFiltered();
    updateSummary(filtered);
    updateStarTable(filtered);
    updateCrossTab(filtered);
    updateTopWords(filtered, 'negative', 'top-words', 'word-link');
    updateTopWords(filtered, 'positive', 'top-words-pos', 'word-link-pos');
    const commentsTable = document.getElementById('comments-table');
    const tbody = commentsTable.getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    let toShow = filtered.slice();
    // Sort by date (newest first), then by sentiment (most negative/positive), then by score
    if (sentimentType === 'negative') {{
        toShow = toShow.filter(row => parseFloat(row.sentiment_raw) < -0.15);
        toShow.sort((a, b) => {{
            // First by date (newest first)
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA.getTime() !== dateB.getTime()) return dateB - dateA;
            // Then by sentiment (most negative first - lower values like -0.8 before -0.1)
            if (a.sentiment_raw !== b.sentiment_raw) return parseFloat(a.sentiment_raw) - parseFloat(b.sentiment_raw);
            // Finally by score (lowest first)
            return parseFloat(a.score) - parseFloat(b.score);
        }});
    }} else {{
        toShow = toShow.filter(row => parseFloat(row.sentiment_raw) > 0.15);
        toShow.sort((a, b) => {{
            // First by date (newest first)
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA.getTime() !== dateB.getTime()) return dateB - dateA;
            // Then by sentiment (most positive first - higher values like 0.8 before 0.1)
            if (a.sentiment_raw !== b.sentiment_raw) return parseFloat(b.sentiment_raw) - parseFloat(a.sentiment_raw);
            // Finally by score (highest first)
            return parseFloat(b.score) - parseFloat(a.score);
        }});
    }}
    if (wordFilter) {{
        // Use exact word boundary matching instead of substring matching
        const wordRegex = new RegExp(`\\b${{wordFilter}}\\b`, 'i');
        toShow = toShow.filter(row => {{
            // Filter by word match first
            if (!row.words || !wordRegex.test(row.words)) return false;
            // Then filter by minimum comment length (10 words) using the original review text
            if (!row.review) return false;
            const wordCount = String(row.review).trim().split(/\\s+/).filter(w => w.length > 0).length;
            return wordCount >= 10;
        }});
        document.getElementById('comments-title').innerText = sentimentType === 'negative'
            ? `Top ${{Math.min(20, toShow.length)}} Most Negative Comments Containing "${{wordFilter}}"`
            : `Top ${{Math.min(20, toShow.length)}} Most Positive Comments Containing "${{wordFilter}}"`;
    }} else {{
        document.getElementById('comments-title').innerText = sentimentType === 'negative'
            ? `Top ${{Math.min(20, toShow.length)}} Most Negative Comments`
            : `Top ${{Math.min(20, toShow.length)}} Most Positive Comments`;
    }}
    toShow = toShow.slice(0, 20);
    toShow.forEach((row) => {{
        const newRow = tbody.insertRow();
        let reviewText = row.review;
        if (wordFilter && reviewText) {{
            /* Bold the word (case-insensitive, exact word match) */
            const re = new RegExp(`\\b(${{wordFilter}})\\b`, 'gi');
            reviewText = reviewText.replace(re, '<b>$1</b>');
        }}
        newRow.innerHTML = `
            <td>${{formatNumber(row.score)}}</td>
            <td class="${{row.sentiment_raw > 0.15 ? 'sentiment-pos' : (row.sentiment_raw < -0.15 ? 'sentiment-neg' : 'sentiment-neu')}}">${{row.sentiment}}</td>
            <td>${{reviewText}}</td>
            <td>${{row.date}}</td>
        `;
    }});
    // Only show table if there's a word filter (user clicked on a word)
    if (wordFilter) {{
        commentsTable.style.display = toShow.length ? '' : 'none';
    }} else {{
        // Ensure table stays hidden when no word filter is active
        commentsTable.style.display = 'none';
    }}
}}

// Word click handlers
document.addEventListener('click', function(e) {{
    if (e.target.classList.contains('word-link')) {{
        e.preventDefault();
        const word = e.target.getAttribute('data-word');
        updateAll(word, 'negative');
        // Show table and title when negative word is clicked
        document.getElementById('comments-table').style.display = '';
        document.getElementById('comments-title').style.display = '';
    }}
    if (e.target.classList.contains('word-link-pos')) {{
        e.preventDefault();
        const word = e.target.getAttribute('data-word');
        updateAll(word, 'positive');
        // Show table and title when positive word is clicked
        document.getElementById('comments-table').style.display = '';
        document.getElementById('comments-title').style.display = '';
    }}
}});

// Initialize page - just update data, keep table hidden
updateAll();
renderPlatformFilter();
    // Dual-handle slider setup (already present)
    const yearSlider = document.getElementById('yearRangeSlider');
    noUiSlider.create(yearSlider, {{
        start: [yearStart, yearEnd],
        connect: true,
        step: 1,
        range: {{ min: {min_year}, max: {max_year} }},
        tooltips: [true, true],
        format: {{
            to: value => Math.round(value),
            from: value => Math.round(value)
        }}
    }});
    yearSlider.noUiSlider.on('update', function(values) {{
        yearStart = parseInt(values[0]);
        yearEnd = parseInt(values[1]);
        document.getElementById('sliderValues').innerText = `${{yearStart}} - ${{yearEnd}}`;
        // Only update data, don't show table unless a word was previously clicked
        const currentlyVisible = document.getElementById('comments-table').style.display !== 'none';
        updateAll();
        if (!currentlyVisible) {{
            document.getElementById('comments-table').style.display = 'none';
            document.getElementById('comments-title').style.display = 'none';
        }}
    }});
}});
</script>
</body>
</html>
'''
# =====================
# 3. MAIN EXECUTION
# =====================

def main():
    df = get_data()
    # Star rating summary
    score_counts = df['score'].value_counts().sort_index(ascending=False)
    score_summary_html = '<table><tr><th>Stars</th><th>Count</th></tr>'
    for star in range(5, 0, -1):
        score_summary_html += f'<tr><td>{star}</td><td>{score_counts.get(star, 0)}</td></tr>'
    score_summary_html += '</table>'
    # Score vs. sentiment-type cross-tab
    cross_tab = pd.crosstab(df['score'], df['sentiment_type'])
    cross_tab_html = cross_tab.to_html(classes='cross-tab', border=0)
    # Top words
    try:
        nltk.data.find('corpora/stopwords')
    except LookupError:
        nltk.download('stopwords')
    stop_words = set(nltk.corpus.stopwords.words('english'))
    stop_words.update(['app', 'zalando', 'lounge', 'use', 'get'])
    top_words = get_top_words(df, 'negative', stop_words)
    top_words_html = '<table id="top-words" style="margin-bottom:24px;"><tr><th>Word</th><th>Count</th></tr>'
    for word, count in top_words:
        top_words_html += f'<tr><td><a href="#" class="word-link" data-word="{word}">{word}</a></td><td>{count:,}</td></tr>'
    top_words_html += '</table>'
    top_words_pos = get_top_words(df, 'positive', stop_words)
    top_words_pos_html = '<table id="top-words-pos" style="margin-bottom:24px;"><tr><th>Word</th><th>Count</th></tr>'
    for word, count in top_words_pos:
        top_words_pos_html += f'<tr><td><a href="#" class="word-link-pos" data-word="{word}">{word}</a></td><td>{count:,}</td></tr>'
    top_words_pos_html += '</table>'
    # Years
    all_years = sorted([y for y in df['review_date'].dt.year.unique() if y is not None])
    min_year = min(all_years)
    max_year = max(all_years)
    # Platforms
    platforms = sorted(set(df['platform'].dropna().unique()))
    # Comments for JS
    all_comments = get_all_comments(df)
    # Build HTML
    html = build_html(min_year, max_year, score_summary_html, cross_tab_html, top_words_html, top_words_pos_html, all_comments, platforms)
    # Write to file
    output_path = os.path.join(os.path.dirname(__file__), 'report.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    # Open in browser
    try:
        import webbrowser
        webbrowser.open('file://' + output_path)
    except Exception as e:
        print(f"Error opening file in browser: {e}")

if __name__ == '__main__':
    main()
