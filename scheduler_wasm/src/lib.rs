// wasm-pack build --target web --out-dir ../src/wasm_pkg

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use web_sys::console;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}
//
// =========================
// CORE STRUCTS
// =========================
//

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub day: String,
    pub start_min: u16,
    pub end_min: u16,

    pub class_section: String,
    pub instructor: String,
    pub room: String,
    pub registration_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub registration_number: String,
    pub subject: String,
    pub catalog_number: String,

    pub academic_career: String,
    pub campus: String,
    pub session: String,
    pub instruction_mode: String,

    pub enrollment_capacity: u32,
    pub enrollment_total: u32,
    pub seats_available: u32,
    pub capacity_available: String,
    pub waitlist_available: u32,

    pub blocks: Vec<Block>,
}

//
// =========================
// JSON OUTPUT STRUCTS
// =========================
//

#[derive(Debug, Clone, Serialize)]
pub struct Schedule {
    pub sections: Vec<Section>,
}

//
// =========================
// WASM ENTRY POINT
// =========================
//
#[wasm_bindgen]
pub fn generate_schedules_from_sections(sections: JsValue) -> String {
    let sections: Vec<Section> =
        serde_wasm_bindgen::from_value(sections).unwrap();

    let grouped = group_by_course(sections);

    let course_groups: Vec<Vec<Section>> =
        grouped.into_iter().map(|(_, v)| v).collect();

    let mut results = Vec::new();
    let mut current = Vec::new();

    backtrack(&course_groups, 0, &mut current, &mut results);

    schedules_to_json(results)
}

//
// =========================
// GROUPING
// =========================
//

fn group_by_course(sections: Vec<Section>) -> HashMap<String, Vec<Section>> {
    let mut map: HashMap<String, Vec<Section>> = HashMap::new();

    for section in sections {
        let key = format!("{} {}", section.subject, section.catalog_number);
        map.entry(key).or_default().push(section);
    }

    map
}

//
// =========================
// BACKTRACKING (STRICT)
// =========================
//

fn backtrack(
    courses: &Vec<Vec<Section>>,
    index: usize,
    current: &mut Vec<Section>,
    results: &mut Vec<Vec<Section>>,
) {
    if index == courses.len() {
        results.push(current.clone());
        return;
    }

    let course_sections = &courses[index];

    for section in course_sections {
        if can_add_section(current, section) {
            current.push(section.clone());

            backtrack(courses, index + 1, current, results);

            current.pop();
        }
    }
}

fn can_add_section(current: &Vec<Section>, candidate: &Section) -> bool {
    for existing in current {
        if sections_conflict(existing, candidate) {
            return false;
        }
    }
    true
}

//
// =========================
// CONFLICT DETECTION
// =========================
//

pub fn sections_conflict(a: &Section, b: &Section) -> bool {
    for ba in &a.blocks {
        if ba.start_min == ba.end_min && ba.start_min == 0 {
            continue;
        }

        for bb in &b.blocks {
            if bb.start_min == bb.end_min && bb.start_min == 0 {
                continue;
            }
            if ba.day == bb.day
                && ba.start_min < bb.end_min + 15
                && bb.start_min < ba.end_min + 15
            {
                return true;
            }
        }
    }
    false
}

//
// =========================
// JSON EXPORT
// =========================
//

fn schedules_to_json(schedules: Vec<Vec<Section>>) -> String {
    let output: Vec<Schedule> = schedules
        .into_iter()
        .map(|sched| Schedule {
            sections: sched,
        })
        .collect();

    serde_json::to_string(&output).unwrap()
}
