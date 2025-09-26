# scraper/scrape_catalog.py

import requests
from bs4 import BeautifulSoup, SoupStrainer
import json
from pathlib import Path

BASE_URL = "https://catalog.uconn.edu"
CATALOG_URL = f"{BASE_URL}/undergraduate/courses/#coursestext"

def get_subject_links():
    """Fetch all subject links from the main catalog page."""
    response = requests.get(CATALOG_URL)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    subject_links = []
    filter = SoupStrainer(id='coursestextcontainer')

    for a in soup.find(filter).select("a"):
        href = a.get("href")
        if isinstance(href, list):  # ensure it's a string, not a list
            href = href[0]

        if isinstance(href, str) and href.startswith("/undergraduate/courses/"):
            subject_links.append(BASE_URL + href)
    return subject_links

import re
import string

def fix_link(s):
    # Pattern: uppercase letters + \u00A0 + digits
    pattern = re.compile(r'([A-Z]+)\u00A0(\d+)')

    def replacer(match):
        letters = match.group(1)
        numbers = match.group(2)
        # Determine if we need a space after the numbers
        end_pos = match.end(2)  # position after the number
        # Check if next char exists and is punctuation
        if end_pos < len(s) and s[end_pos] in string.punctuation:
            after_space = ""
        else:
            after_space = " "
        # Insert space before letters, replace unicode with space, and add conditional space after number
        return f" {letters} {numbers}{after_space}"

    return pattern.sub(replacer, s)

def scrape_subject(url):
    """Scrape all courses from a single subject page."""
    response = requests.get(url)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    courses = []

    for course_div in soup.select(".courseblock"):
        descs = course_div.select(".noindent")
        head = descs[0]
        desc_tag = descs[1]

        req = ""
        writing = 0
        quant = 0
        envir = 0
        ca1=0
        ca2=0
        ca3=0
        ca4=0
        ca4int=0
        toi1=0
        toi2=0
        toi3=0
        toi4=0
        toi5=0
        toi6=0

        details = [fix_link(s.get_text(strip=True)) for s in descs[2:]]
        for detail in details:
            if detail is None: 
                break
            if detail.startswith("Enrol"):
                req = detail[detail.find(':') + 2:]
            elif detail.startswith("Sk"):
                if "Envir" in detail:
                    envir = 1
                if "Writ" in detail:
                    writing = 1
                if "Quant" in detail:
                    quant = 1
            elif detail.startswith("Content"):
                if "ca1" in detail.lower():
                    ca1 = 1
                if "ca2" in detail.lower():
                    ca2 = 1
                if "ca3" in detail.lower():
                    ca3 = 1
                if "ca4int" in detail.lower():
                    ca4int = 1
                if "ca4" in detail.lower():
                    ca4 = 1
            elif detail.startswith("Top"):
                if "toi1" in detail.lower():
                    toi1 = 1
                if "toi2" in detail.lower():
                    toi2 = 1
                if "toi3" in detail.lower():
                    toi3 = 1
                if "toi4" in detail.lower():
                    toi4 = 1
                if "toi5" in detail.lower():
                    toi5 = 1
                if "toi6" in detail.lower():
                    toi6 = 1

        head_list = head.get_text(strip=True).split('.') if head else []
        code_title = head_list[0]
        name = head_list[1]
        space_i = head_list[2].find(' ')
        num_credits = head_list[2][1:space_i]
        desc = desc_tag.get_text(strip=True) if desc_tag else ""
        # req = req_tag.get_text(strip=True) if req_tag else ""

        course = fix_link(code_title).split(' ')
        courses.append({
            "course": course[0],
            "catalog_number": course[1],
            "name": fix_link(name),
            "num_credits": fix_link(num_credits),
            "description": fix_link(desc),
            "requirements": req,
            "writing": writing,
            "quantitative": quant,
            "environmental": envir,
            "ca1": ca1,
            "ca2": ca2,
            "ca3": ca3,
            "ca4": ca4,
            "ca4int": ca4int,
            "toi1": toi1,
            "toi2": toi2,
            "toi3": toi3,
            "toi4": toi4,
            "toi5": toi5,
            "toi6": toi6,
        })

    return courses
def save_results(data, filename="../public/courses.json"):
    """Save all courses to JSON file."""
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Saved {len(data)} courses to {filename}")


if __name__ == "__main__":
    print("🔍 Fetching subject links...")
    subject_links = get_subject_links()
    print(f"Found {len(subject_links)} subjects.")

    all_courses = []
    for i, link in enumerate(subject_links, 1):
        print(f"[{i}/{len(subject_links)}] Scraping {link}")
        subject_courses = scrape_subject(link)
        all_courses.extend(subject_courses)

    save_results(all_courses)
    print(f"🎉 Done! Total courses scraped: {len(all_courses)}")
