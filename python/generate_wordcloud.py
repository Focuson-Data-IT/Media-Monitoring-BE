import sys
import json
import re
from wordcloud import WordCloud
from collections import Counter

# Stopwords Bahasa Indonesia dasar (bisa tambahin terus)
STOPWORDS_ID = set([
    'yang', 'dan', 'di', 'ke', 'dari', 'itu', 'ini', 'untuk', 'dengan', 'pada', 'ada', 'karena',
    'jadi', 'sudah', 'belum', 'juga', 'akan', 'bisa', 'saja', 'hanya', 'atau', 'lagi', 'kalau',
    'kalo', 'ga', 'gak', 'gw', 'gue', 'aku', 'kamu', 'kan', 'nya', 'dia', 'mereka', 'kami', 'kita',
    'udah', 'aja', 'min', 'bang', 'loh', 'mah', 'deh', 'dong', 'tuh', 'nih', 'ya', 'yg', 'sm',
    'sy', 'lu', 'lo', 'jd', 'tp', 'dr', 'si', 'dl', 'semua', 'sama', 'banget', 'mana', 'sini', 'karna', 'tapi', 'emang'
])

def clean_text(text):
    print("📦 Membersihkan teks...")
    text = text.lower()
    text = re.sub(r'[^a-zA-Z\s]', '', text)  # Hapus angka dan simbol
    words = text.split()
    filtered_words = [word for word in words if word not in STOPWORDS_ID and len(word) > 3]
    print(f"✅ Jumlah kata setelah filter: {len(filtered_words)}")
    return filtered_words

def generate_wordcloud(words, output_path="wordcloud.png", boost_keywords=None, downgrade_keywords=None):
    print("🌥️ Membuat WordCloud...")
    freq = Counter(words)

    # Boost frekuensi kata penting
    if boost_keywords:
        for word in boost_keywords:
            if word in freq:
                freq[word] *= 5  # boost frekuensi (misalnya 5x)

    # Downgrade kata yang terlalu besar
    if downgrade_keywords:
        for word in downgrade_keywords:
            if word in freq:
                freq[word] = max(1, freq[word] // 5)

    wc = WordCloud(width=1200, height=600, background_color="white").generate_from_frequencies(freq)
    wc.to_file(output_path)
    print("✅ WordCloud disimpan ke", output_path)
    print("done")

if __name__ == "__main__":
    print("🚀 Mulai proses WordCloud...")
    input_data = sys.stdin.read()
    payload = json.loads(input_data)

    comment_text = payload.get("text", "")
    filename = payload.get("filename", "wordcloud.png")
    boost_keywords = payload.get("boost", [])  # new!
    downgrade_keywords = payload.get("downgrade", [])  # new!

    cleaned_words = clean_text(comment_text)
    generate_wordcloud(cleaned_words, output_path=filename, boost_keywords=boost_keywords, downgrade_keywords=downgrade_keywords)

