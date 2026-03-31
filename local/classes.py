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

def fetch_course(course, semester, search_type="alias"):
    # API endpoint
    url = f"https://classes.uconn.edu/api/?page=fose&route=search&{search_type}={course}"

    payload = {
        "other": {"srcdb":f"{semester['value']}"},
        "criteria": [{"field":f"{search_type}", "value":f"{course}"}]
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
                return None, []
        except Exception as e:
            print(f"⚠️ Failed to parse JSON for {course}: {e}")
    else:
        print(f"❌ Error {response.status_code} for {course}")

    # time.sleep(0.2)  # small delay to be nice to server

    unique_codes = []
    detail_results = []
    for section in initial_data:
        section_id = section["crn"]
        if not section_id:
            continue

        if section['code'] not in unique_codes:
            unique_codes.append(section_id)

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
        print(f"                                                      Scraped {section['code']}: {section_id}")
    course_list = []

    for i in range(len(initial_data)):
        i_d = initial_data[i]
        d_r = detail_results[i]

        attributes = []
        attributes_str = d_r['section_attributes']
        if attributes_str != "":
            attributes = [s.split(':',1)[0] for s in re.findall(r'(?<=<li>)([^:]+):', attributes_str)]


        course_final = {
            "semester": semester['value'],
            "code": i_d["code"],
            "crn": i_d["crn"],
            "title": i_d["title"],
            "no": i_d["no"],
            "is_open": 1 if i_d["stat"] == 'A' else 0,
            "meeting_times": i_d["meetingTimes"],
            "career": i_d["acad_career"],
            "linked_crns": i_d["linked_crns"],
            "is_enroll_section": i_d['is_enroll_section'],
            "max_enroll": int(re.search(r'(?<!\d)\d+(?!\d)', d_r["seats"]).group()) if re.search(r'(?<!\d)\d+(?!\d)', d_r["seats"]) else None,
            "seats_available": int(re.findall(r'\d+', d_r["seats"])[1]) if len(re.findall(r'\d+', d_r["seats"])) > 1 else None,
            "schd": d_r["schd"],
            "campus": d_r["camp_html"],
            "inst_mode": d_r["instmode"],
            "requirements": d_r["registration_restrictions"],
            "reserved_seats": d_r["reserved_seats"],
            "session": d_r["session_html"],
            "num_credits": d_r["hours_html"][:d_r["hours_html"].find(' ')],
            "description": d_r['description'],
            "attributes": attributes
        }
        course_list.append(course_final)
    return course_list, unique_codes


def scrape_all(courses, semester, search_type="alias"):
    results = []
    codes = []
    for i, course in enumerate(courses,1):
        # name = course['course'] + " " + course['catalog_number']
        name = course
        data, unique_codes = fetch_course(name, semester, search_type)
        if data is not None:
            results.extend(data)
            print(f"[{i}/{len(courses)}] Scraping {name} for {semester.get_text(strip=True)}")
    return results, unique_codes

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
    sem_list = []
    for sem in sems:
        sem_dict = {
            "value": sem['value'],
            "name": sem.get_text(strip=True)
        }
        sem_list.append(sem_dict)

    save_results(sem_list, "../public/semesters.json")
    scrape = True
    if len(sys.argv) > 1:
        if sys.argv[1] == '0':
            scrape = False
        elif sys.argv[1] not in sems:
            sems = [sems[0]]
        else:
            sems = sys.argv[1:]

    if scrape:
        print("🔍 Fetching course details...")
        # path = Path("../public/courses.json")
        # with path.open("r", encoding="utf-8") as f:
        #     courses = json.load(f)

        path = Path("./subject.txt")
        with path.open("r", encoding='utf-8') as f:
            courses = [line.strip() for line in f.readlines()]

        unique_codes = []
        for sem in sems:
            results, u_codes = scrape_all(courses, sem, "subject")
            save_results(results, f"../public/semesters/{sem['value']}-classes.json")
            for code in u_codes:
                if code not in unique_codes:
                    unique_codes.append(code)

        path = Path("../public/courses.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            for code in unique_codes:
                f.write(code+'\n')

    merged = []
    sem_dir = Path('../public/semesters')
    for file in sem_dir.iterdir():
        with file.open("r", encoding="utf-8") as f:
            merged.extend(json.load(f))
    print(len(merged))
    save_results(merged, "../public/all_data.json")
