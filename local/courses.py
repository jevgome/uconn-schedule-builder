import requests
import sys
from bs4 import BeautifulSoup, SoupStrainer
import time
import json
from pathlib import Path
import asyncio
import aiohttp
import random
import re
from lxml import etree
import time
import re

def scrape_room():
    session = requests.Session()
    url="https://student.studentadmin.uconn.edu/psc/CSGUE/EMPLOYEE/HRMS/c/COMMUNITY_ACCESS.CLASS_SEARCH.GBL"
    res = session.get(url)
    soup = BeautifulSoup(res.text, "html.parser")
    icsid = soup.find("input", {"name": "ICSID"})["value"]
    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICAction": "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH",
        "CLASS_SRCH_WRK2_STRM$35$": "1268",
        "SSR_CLSRCH_WRK_SUBJECT_SRCH$0": "ME",
        "SSR_CLSRCH_WRK_CATALOG_NBR$1": "3253",
        "SSR_CLSRCH_WRK_CAMPUS$2": "STORR",
    }
    res2 = session.post(url, data=payload)
    print(res2.text)

def scrape_courses(semester, subject):
    session = requests.Session()
    url="https://student.studentadmin.uconn.edu/psc/CSGUE/EMPLOYEE/HRMS/c/UC_ENROLL.UC_GUEST_CLS_SCH.GBL"
    res = session.get(url)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': url
    }
    soup = BeautifulSoup(res.text, "html.parser")
    icsid = soup.find("input", {"name": "ICSID"})["value"]
    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICAction": "#ICPanel1",
        "ICSID": icsid,
        # "UC_DERIVED_GST_STRM1": semester,
        # "UC_DERIVED_GST_CAMPUS": "STORR",
    }
    session.post(url, headers=headers, data=payload)
    
    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICAction": "UC_DERIVED_GST_STRM",
        "UC_DERIVED_GST_STRM": semester,
        "ICSID": icsid,
    }
    session.post(url, data=payload)

    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICAction": "UC_DERIVED_GST_SEARCH_PB",
        "UC_DERIVED_GST_STRM": semester,
        "UC_DERIVED_GST_SUBJECT": subject,
        "CAMPUS_TBL$selmh$0$$0": "Y",
        "CAMPUS_TBL$selm$0$$0": "n",
        "CAMPUS_TBL$selmh$1$$0": "Y",
        "CAMPUS_TBL$selm$1$$0": "n",
        "CAMPUS_TBL$selmh$2$$0": "Y",
        "CAMPUS_TBL$selm$2$$0": "n",
        "UC_CAMPUS_VW$selmh$0$$0": "Y",
        "UC_CAMPUS_VW$selm$0$$0": "on",
        "UC_CAMPUS_VW$selmh$1$$0": "Y",
        "UC_CAMPUS_VW$selm$1$$0": "on",
        "UC_CAMPUS_VW1$selmh$0$$0": "Y",
        "UC_CAMPUS_VW1$selm$0$$0": "on",
        "UC_CAMPUS_VW1$selmh$1$$0": "Y",
        "UC_CAMPUS_VW1$selm$1$$0": "on",
        "UC_CAMPUS_VW1$selmh$2$$0": "Y",
        "UC_CAMPUS_VW1$selm$2$$0": "on",
        "UC_DERIVED_GST_ENRL_STAT$chk": "C",
        "UC_DERIVED_GST_FLAG2$chk": "Y",
        "UC_DERIVED_GST_FLAG2": "Y",
        "UC_DERIVED_GST_FLAG3$chk": "Y",
        "UC_DERIVED_GST_FLAG3": "Y",
        "UC_DERIVED_GST_FLAG5$chk": "Y",
        "UC_DERIVED_GST_FLAG5": "Y",
        "UC_DERIVED_GST_FLAG4$chk": "Y",
        "UC_DERIVED_GST_FLAG4": "Y",
        "UC_DERIVED_GST_FLAG1$chk": "Y",
        "UC_DERIVED_GST_FLAG1": "Y",
        "ICSID": icsid,
    }
    res2 = session.post(url, data=payload)
    if "popupText" in res2.text:
        return None

    match = re.search(r'<FIELD(.*?)><!\[CDATA\[(.*?)\]\]>', res2.text.strip(), re.DOTALL)
    if match:
        data = []
        content = match.group(2)
        strainer = SoupStrainer("table", class_="PSLEVEL1GRID")
        table = BeautifulSoup(content, "lxml", parse_only=strainer)
        rows = table.find_all('tr')
        for row in rows[1:]:
            row_data = list(map(lambda d: d.get_text(strip=True), row.find_all('div')))
            course_data = {
                "registration_number": row_data[0],
                "subject": row_data[1],
                "catalog_number": row_data[2],
                "class_section": row_data[3],
                "academic_career": row_data[4],
                "campus": row_data[6],
                "session": row_data[7],
                "instruction_mode": row_data[9],
                "meeting_times": row_data[10],
                "additional_sections": row_data[11],
                "enrollment_capacity": row_data[12],
                "enrollment_total": row_data[13],
                "seats_available": row_data[14],
                "capacity_available": row_data[15],
                "waitlist_available": row_data[16],
                "instructor": row_data[17],
            }
            data.append(course_data)
        return data
    else:
        return None
    
def scrape_semester(semester):
    """Scrape all course data for a given semester."""
    path = Path("./subject.txt")
    with path.open("r", encoding='utf-8') as f:
        subjects = [line.strip() for line in f.readlines()]

    results = []
    for i, subject in enumerate(subjects,1):
        name = subject

        data = scrape_courses(semester['value'], subject)
        if data is not None:
            results.extend(data)
            print(f"[{i:>{len(str(len(subjects)))}}/{len(subjects)}] Scraped {name} for {semester['name']}")

        else:
                print(f"[{i:>{len(str(len(subjects)))}}/{len(subjects)}] {name} not in {semester['name']}")
    return results

def save_results(data, filename="../public/classes.json"):
    """Save all courses to JSON file."""
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Saved {len(data)} courses to {filename}")

if __name__ == "__main__":
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
    if len(sys.argv) > 1:
        if sys.argv[1] == '0':
            scrape = False
        elif sys.argv[1] not in sems:
            sems = [sems[0]]
        else:
            sems = sys.argv[1:]

    print("🔍 Fetching course details...")

    for sem in sem_list:
        results = scrape_semester(sem)
        save_results(results, f"../public/semesters/{sem['value']}-classes.json")
        print()
