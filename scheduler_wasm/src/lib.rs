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
    pub start_time: u16,
    pub end_time: u16,

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

    let conflicts = build_conflict_matrix(&sections);

    // Unpack both grouped courses and the flat list of break indices
    let (mut course_groups, break_indices) = group_by_course(&sections);

    course_groups.sort_by_key(|group| group.len());

    for group in &mut course_groups {
        group.sort_by_key(|&section_index| {
            sections[section_index].blocks.len()
        });
    }

    let mut results: Vec<Vec<usize>> = Vec::new();
    
    // Pre-seed the current schedule with ALL break sections. 
    // This forces the backtracker to treat them as fixed blocks.
    let mut current: Vec<usize> = break_indices;

    backtrack(
        &course_groups,
        0,
        &mut current,
        &mut results,
        &conflicts,
    );

    schedules_to_json(results, &sections)
}

//
// =========================
// GROUPING
// =========================
//
fn group_by_course(sections: &[Section]) -> (Vec<Vec<usize>>, Vec<usize>) {
    let mut map: HashMap<String, Vec<usize>> = HashMap::new();
    let mut break_indices: Vec<usize> = Vec::new();

    for (index, section) in sections.iter().enumerate() {
        if section.registration_number == "BREAK" {
            // Collect breaks separately
            break_indices.push(index);
        } else {
            // Group standard classes
            let key = format!("{} {}", section.subject, section.catalog_number);
            map.entry(key).or_default().push(index);
        }
    }

    (map.into_values().collect(), break_indices)
}

//
// =========================
// BACKTRACKING (STRICT)
// =========================
//

fn backtrack(
    courses: &Vec<Vec<usize>>,
    index: usize,
    current: &mut Vec<usize>,
    results: &mut Vec<Vec<usize>>,
    conflicts: &Vec<Vec<bool>>,
) {
    // if index == courses.len() {
    //     results.push(current.clone());
    //     return;
    // }
    if index == courses.len() {
        if results.len() < 10000 {
            results.push(current.clone());
        }
        return;
    }

    let course_sections = &courses[index];

    for &section_index in course_sections {
        if can_add_section(
            current,
            section_index,
            conflicts,
        ) {
            current.push(section_index);

            backtrack(
                courses,
                index + 1,
                current,
                results,
                conflicts,
            );

            current.pop();
        }
    }
}

fn can_add_section(
    current: &[usize],
    candidate: usize,
    conflicts: &[Vec<bool>],
) -> bool {
    for &existing in current {
        if conflicts[existing][candidate] {
            return false;
        }
    }

    true
}

fn build_conflict_matrix(sections: &[Section]) -> Vec<Vec<bool>> {
    let n = sections.len();

    let mut matrix = vec![vec![false; n]; n];

    for i in 0..n {
        if section_has_internal_conflict(&sections[i]) {
            matrix[i][i] = true;
        }

        for j in i + 1..n {
            let conflict = sections_conflict(
                &sections[i],
                &sections[j],
            );

            matrix[i][j] = conflict;
            matrix[j][i] = conflict;
        }
    }

    matrix
}

pub fn sections_conflict(a: &Section, b: &Section) -> bool {
    if section_has_internal_conflict(a) {
        return true;
    }

    // Same section: already checked itself
    if std::ptr::eq(a, b) {
        return false;
    }

    if section_has_internal_conflict(b) {
        return true;
    }

    for ba in &a.blocks {
        if is_empty_block(ba) {
            continue;
        }

        for bb in &b.blocks {
            if is_empty_block(bb) {
                continue;
            }

            if blocks_conflict(ba, bb) {
                return true;
            }
        }
    }

    false
}

fn section_has_internal_conflict(section: &Section) -> bool {
    for i in 0..section.blocks.len() {
        let a = &section.blocks[i];

        if is_empty_block(a) {
            continue;
        }

        for b in &section.blocks[i + 1..] {
            if is_empty_block(b) {
                continue;
            }

            if blocks_conflict(a, b) {
                return true;
            }
        }
    }

    false
}


fn blocks_conflict(a: &Block, b: &Block) -> bool {
    if a.day != b.day {
        return false;
    }

    // 15 minute transition buffer
    let mut offset = 15;
    if a.registration_number == "BREAK" || b.registration_number == "BREAK" {
        offset = 0;
    }
    a.start_time < b.end_time + offset
        && b.start_time < a.end_time + offset
}


fn is_empty_block(block: &Block) -> bool {
    block.start_time == 0 && block.end_time == 0
}

//
// =========================
// JSON EXPORT
// =========================
//
fn schedules_to_json(
    schedules: Vec<Vec<usize>>,
    sections: &[Section],
) -> String {
    let output: Vec<Schedule> = schedules
        .into_iter()
        .map(|sched| Schedule {
            sections: sched
                .into_iter()
                .map(|i| sections[i].clone())
                .collect(),
        })
        .collect();

    serde_json::to_string(&output)
    .unwrap_or_else(|e| {
        format!("{{\"error\":\"{}\"}}", e)
    })
}
