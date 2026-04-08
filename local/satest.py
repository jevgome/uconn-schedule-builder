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
from lxml import etree

def SA_get_room():
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
    # soup2 = BeautifulSoup(res2.text.strip(), "xml")
    # tsoup = BeautifulSoup(soup2.find('FIELD').get_text(), "html.parser")
    table = tsoup.find('table', class_='PSLEVEL1GRID')
    data = table.find_all('tr')
    return data
    # return soup2.find('FIELD').prettify()
    # return tsoup

if __name__ == "__main__":
    # SA_get_room()
    res = scrape_courses("1268", "CSE")
    print(res[1])
