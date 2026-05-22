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
from concurrent.futures import ThreadPoolExecutor

def scrape_courses(semester, subject, session=None):
    # time.sleep(random.uniform(0.1,0.5))
    if not session: session = requests.Session()
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
        "ICStateNum": "1",
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
        "ICStateNum": "2",
    }
    session.post(url, data=payload)

    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICStateNum": "3",
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
    if res2.status_code == 429:
        raise ValueError("429")
    if "popupText" in res2.text:
        print(f"{subject} not in {semester}")
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
        print(f"Scraped {subject} for {semester}")
        return data
    else:
        raise ValueError("somtin wrong")
        return None
    
def build_sections_from_entries(semester, entries):
    """Converts data entries into final block-based sections."""
    result = []
    lecture_dict = {}
    for entry in entries:
        if not entry["registration_number"]:
            lecture_dict[(entry["subject"], entry["catalog_number"], entry["class_section"])] = entry

    with open(f"./semesters/{semester['value']}/rooms.json") as f:
        room_data = json.load(f)

    for entry in entries:
        if not entry["registration_number"]:
            continue

        a_s = entry["additional_sections"]
        modules = [entry]
        if a_s:
            extra_sections = a_s[a_s.find("s) ")+3:].split(", ")
            try:
                modules.extend([lecture_dict[(entry["subject"], entry["catalog_number"], s)] for s in extra_sections])
            except KeyError:
                continue

        blocks = []
        additional_blocks = []
        for module in modules:
            room = ""
            registration_number = module["registration_number"]
            room_entry = next((r_e for r_e in room_data if r_e["course"] == entry["subject"] + " " + entry["catalog_number"] and r_e["section"] == module["class_section"]), None)
            if room_entry:
                room = room_entry["room"]
                registration_number = room_entry["registration_number"]
            else:
                print(f"Room not found: {entry["subject"]} {entry["catalog_number"]} - {module["class_section"]}")

            mt = module["meeting_times"]

            # Edge Cases
            if "Arrange" in mt or "Async" in module["instruction_mode"] or ("&" in mt and "(" in mt):
                day = ""
                if "Arrange" in mt:
                    day = "By Arrangement"
                elif "Async" in module["instruction_mode"]:
                    day = "Online Asynchronous"
                elif "&" in mt:
                    day = mt
                new_block = {
                    "class_section": module["class_section"],
                    "day": day,
                    "instructor": module["instructor"],
                    "registration_number": registration_number,
                    "room": room,
                    "start_time": 0,
                    "end_time": 0,
                }
                additional_blocks.append(new_block)
            else:
                chunks = mt.split(" & ")
                for chunk in chunks:
                    parts = [c.strip() for c in chunk.split("/")]
                    if len(parts) != 2:
                        print("Could not parse time")
                        return None

                    days = [parts[1][i:i+2] for i in range(0, len(parts[1]), 2)]
                    times = parts[0].split(" - ")
                    time_mins = []
                    for time in times:
                        time_split = time.split(":")
                        time_min = 0
                        if "PM" in time:
                            time_min += 720
                        time_min += int(time_split[0]) * 60 + int(time_split[1][:2])
                        time_mins.append(time_min)

                    for day in days:

                        new_block = {

                            "class_section": module["class_section"],
                            "day": day,
                            "instructor": module["instructor"],
                            "registration_number": registration_number,
                            "room": room,
                            "start_time": time_mins[0],
                            "end_time": time_mins[1],
                            "instruction_mode": module["instruction_mode"],

                        }
                        blocks.append(new_block)

        new_section = {
            "registration_number": entry["registration_number"],
            "subject": entry["subject"],
            "catalog_number": entry["catalog_number"],
            "class_section": entry["class_section"],
            "academic_career": entry["academic_career"],
            "campus": entry["campus"],
            "session": entry["session"],
            "enrollment_capacity": entry["enrollment_capacity"],
            "enrollment_total": entry["enrollment_total"],
            "seats_available": entry["seats_available"],
            "capacity_available": entry["capacity_available"],
            "waitlist_available": entry["waitlist_available"],
            "blocks": blocks,
            "additional_blocks": additional_blocks,
        }

        result.append(new_section)
    return result

def scrape_semester_courses(semester):
    """Scrape all course data for a given semester."""
    path = Path("./subject.txt")
    with path.open("r", encoding='utf-8') as f:
        subjects = [line.strip() for line in f.readlines()]

    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        data = list(executor.map(lambda u: scrape_courses(semester['value'], u),subjects))
    for i in data:
        if i: results.extend(i)
    return build_sections_from_entries(semester, results)

