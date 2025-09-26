import requests
import sys
from bs4 import BeautifulSoup
import time
import json
from pathlib import Path
import asyncio
import aiohttp
import random
import re

def fetch_course(course, semester):
    # API endpoint
    search_type = "alias"
    url = f"https://classes.uconn.edu/api/?page=fose&route=search&{search_type}={course}"

    payload = {
        "other": {"srcdb":f"{semester['value']}"},
        "criteria": [{"field":f"{search_type}", "value":f"{course.lower()}"}]
    }

    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
    }
    initial_data = []

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        try:
            data = response.json()["results"]
            if len(data):
                initial_data = (response.json()["results"])
            else:
                print(f"                                                                                {course} not in semester {semester.get_text(strip=True)}")
        except Exception as e:
            print(f"⚠️ Failed to parse JSON for {course}: {e}")
    else:
        print(f"❌ Error {response.status_code} for {course}")

    # time.sleep(0.2)  # small delay to be nice to server

    detail_results = []
    for section in initial_data:
        section_id = section["crn"]
        if not section_id:
            continue

        matched_list = [s["crn"] for s in initial_data]
        matched = ",".join(matched_list)
        detail_payload = {
            "group": f"code:{section['code']}",
            "key": f"crn:{section['crn']}",
            "srcdb": semester['value'],
            "matched": f"crn:{matched}"
        }
        url = "https://classes.uconn.edu/api/?page=fose&route=details"

        detail_resp = requests.post(url, headers=headers, json=detail_payload)

        try:
            if detail_resp.status_code != 200:
                print(f"Error {detail_resp.status_code} for detail {section_id}")
                continue
            detail_results.append(detail_resp.json())
        except Exception as e:
            print(f"Detail request failed for section {section_id}: {e}")
        print(f"                                                      Scraped {section_id}")
    course_list = []

    for i in range(len(initial_data)):
        i_d = initial_data[i]
        d_r = detail_results[i]
        course_final = {
            "code": i_d["code"],
            "crn": i_d["crn"],
            "title": i_d["title"],
            "no": i_d["no"],
            "schd": i_d["schd"],
            "is_open": 1 if i_d["stat"] == 'A' else 0,
            "meeting_times": i_d["meetingTimes"],
            "career": i_d["acad_career"],
            "enroll_link": i_d["linked_crns"],
            "max_enroll": int(re.search(r'(?<!\d)\d+(?!\d)', d_r["seats"]).group()) if re.search(r'(?<!\d)\d+(?!\d)', d_r["seats"]) else None,
            "seats_available": int(re.findall(r'\d+', d_r["seats"])[1]) if len(re.findall(r'\d+', d_r["seats"])) > 1 else None,
            "campus": d_r["camp_html"],
            "inst_mode": d_r["instmode"],
            "session": d_r["session_html"],
        }
        course_list.append(course_final)
    return course_list


def scrape_all(courses, semester):
    results = []
    for i, course in enumerate(courses,1):
        name = course['course'] + " " + course['catalog_number']
        results.append(fetch_course(name, semester))
        print(f"[{i}/{len(courses)}] Scraping {name} for {semester.get_text(strip=True)}")
    return results

def save_results(data, filename="../public/classes.json"):
    """Save all courses to JSON file."""
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Saved {len(data)} courses to {filename}")

if __name__ == '__main__':
    # Get semesters
    response = requests.get("https://classes.uconn.edu")
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    sems = soup.find('select', id='crit-srcdb').find_all()
    if len(sys.argv) > 1:
        names = [sem['value'] for sem in sems]
        if sys.argv[1] not in sems:
            sems = [sems[0]]
        else:
            sems = sys.argv[1:]


    print("🔍 Fetching course details...")
    path = Path("../public/courses.json")
    with path.open("r", encoding="utf-8") as f:
        courses = json.load(f)

    for sem in sems:
        start = time.time()
        results = scrape_all(courses, sem)
        elapsed = time.time() - start
        print(f"\nScraped {len(results)} results in {elapsed:.1f}s")

        save_results(scrape_all(courses, sem), f"../public/{sem['value']}-classes.json")
