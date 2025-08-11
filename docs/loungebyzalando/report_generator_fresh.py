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
import webbrowser

# =================================================================================
# 1. DATA PREPARATION
# =================================================================================

def get_data():
    """
    Connects to the PostgreSQL database, fetches review data, and performs
    initial processing like sentiment analysis.
    """
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

    # Calculate sentiment
    if 'translated_content' in df.columns:
        analyzer = PatternAnalyzer()
        df['sentiment_raw'] = df['translated_content'].apply(
            lambda text: analyzer.analyze(str(text)).polarity if pd.notnull(text) else None
        )
        df['sentiment'] = df['sentiment_raw'].map(
            lambda x: f"{x:.2f}" if pd.notnull(x) else ""
        )

    # Classify sentiment type
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

def get_all_comments_for_js(df):
    """
    Formats the DataFrame into a list of dictionaries suitable for JSON
    serialization and use in JavaScript.
    """
    all_comments = []
    for row in df.itertuples(index=False):
        content = row.translated_content
        words = str(content).lower() if content and not pd.isna(content) else ''
        
        date_val = row.review_date
        date_str, year_val = '', None
        if pd.notna(date_val):
            date_str = date_val.strftime('%Y-%m-%d')
            year_val = date_val.year

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

# =================================================================================
# 2. HTML GENERATION
# =================================================================================

def build_report_html(all_comments_json, platforms_json, min_year, max_year):
    """
    Builds the final HTML report by reading the current report.html and injecting dynamic data into it.
    """
    # This is the known-good, hardcoded stopword list from the backup file.
    stopword_js_array = '["where", "lounge", "further", "whom", "s", "it\'ll", "because", "didn", "we\'d", "these", "from", "he\'ll", "y", "re", "are", "after", "some", "won", "if", "ll", "no", "ours", "doing", "through", "she\'d", "use", "do", "i", "be", "now", "themselves", "they\'ll", "he\'d", "below", "it\'d", "i\'ve", "who", "which", "before", "this", "being", "you\'ll", "shouldn", "down", "of", "it", "does", "under", "them", "don", "haven", "needn", "above", "then", "the", "did", "any", "shan\'t", "he\'s", "such", "my", "we\'re", "hadn", "having", "him", "what", "why", "yourself", "other", "we\'ll", "you", "for", "shouldn\'t", "o", "i\'m", "just", "too", "aren\'t", "i\'d", "to", "by", "wouldn", "mustn\'t", "couldn\'t", "during", "most", "wasn\'t", "should\'ve", "with", "again", "me", "they\'d", "that\'ll", "her", "doesn", "mustn", "itself", "ourselves", "so", "wasn", "yourselves", "you\'d", "in", "we\'ve", "nor", "they\'re", "didn\'t", "how", "between", "had", "very", "than", "about", "all", "aren", "up", "haven\'t", "both", "don\'t", "m", "shan", "same", "over", "zalando", "only", "until", "ma", "they\'ve", "get", "weren", "is", "she", "mightn\'t", "himself", "your", "theirs", "that", "couldn", "they", "doesn\'t", "were", "while", "into", "am", "out", "an", "hers", "there", "and", "weren\'t", "will", "it\'s", "at", "our", "own", "wouldn\'t", "myself", "can", "yours", "when", "you\'re", "its", "his", "has", "on", "have", "more", "against", "as", "once", "won\'t", "he", "isn\'t", "a", "but", "few", "she\'ll", "isn", "i\'ll", "herself", "needn\'t", "ve", "she\'s", "hadn\'t", "hasn", "t", "those", "or", "their", "not", "d", "been", "mightn\'t", "was", "app", "we", "hasn\'t", "off", "ain", "each", "here", "you\'ve", "should"]'

    # Read the current report.html file
    report_path = os.path.join(os.path.dirname(__file__), 'report.html')
    with open(report_path, 'r', encoding='utf-8') as f:
        html_template = f.read()

    # Replace placeholders with actual data
    final_html = html_template.replace('__ALL_COMMENTS_JSON__', all_comments_json)
    final_html = final_html.replace('__PLATFORMS_JSON__', platforms_json)
    final_html = final_html.replace('__STOPWORD_JS_ARRAY__', stopword_js_array)
    final_html = final_html.replace('__MIN_YEAR__', str(min_year))
    final_html = final_html.replace('__MAX_YEAR__', str(max_year))

    return final_html


# =================================================================================
# 3. MAIN EXECUTION
# =================================================================================

def main():
    """
    Main function to run the report generation process.
    """
    print("Starting report generation...")
    
    # 1. Get and process data
    print("Fetching data from database...")
    df = get_data()
    print(f"Loaded {len(df)} reviews.")

    # 2. Prepare data for the template
    all_comments = get_all_comments_for_js(df)
    all_comments_json = pyjson.dumps(all_comments)

    platforms = sorted(list(df['platform'].dropna().unique()))
    platforms_json = pyjson.dumps(platforms)

    all_years = [y for y in df['review_date'].dt.year.unique() if pd.notna(y)]
    min_year = min(all_years) if all_years else datetime.date.today().year - 1
    max_year = max(all_years) if all_years else datetime.date.today().year


    # 3. Build the HTML file
    print("Building HTML report...")
    html_content = build_report_html(
        all_comments_json,
        platforms_json,
        min_year,
        max_year
    )

    # 4. Write the report to a file
    output_filename = 'report.html'
    output_path = os.path.join(os.path.dirname(__file__), output_filename)
    print(f"Writing report to: {output_path}")
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print("Report file written successfully.")
    except IOError as e:
        print(f"ERROR: Could not write file to disk. {e}")
        return

    # 5. Open the report in a web browser
    try:
        webbrowser.open('file://' + os.path.realpath(output_path))
        print("Opening report in web browser.")
    except Exception as e:
        print(f"Could not open file in browser: {e}")

if __name__ == '__main__':
    main()
    print("Script finished.")
