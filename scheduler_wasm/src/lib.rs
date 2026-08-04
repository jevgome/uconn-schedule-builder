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

    let mut course_groups = group_by_course(&sections);

    course_groups.sort_by_key(|group| group.len());

    for group in &mut course_groups {
        group.sort_by_key(|&section_index| {
            sections[section_index]
                .blocks
                .len()
        });
    }

    let mut results: Vec<Vec<usize>> = Vec::new();
    let mut current: Vec<usize> = Vec::new();

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
fn group_by_course(sections: &[Section]) -> Vec<Vec<usize>> {
    let mut map: HashMap<String, Vec<usize>> = HashMap::new();

    for (index, section) in sections.iter().enumerate() {
        let key = format!(
            "{} {}",
            section.subject,
            section.catalog_number
        );

        map.entry(key)
            .or_default()
            .push(index);
    }

    map.into_values().collect()
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

//
// =========================
// CONFLICT DETECTION
// =========================
//

// pub fn sections_conflict(a: &Section, b: &Section) -> bool {
//     for i in 0..a.blocks.len()-1 {
//         for j in i+1..a.blocks.len() {
//             let ba = &a.blocks[i];
//             let bb = &a.blocks[j];
//
//             if ba.day == bb.day
//                 && ba.start_time < bb.end_time + 15
//                 && bb.start_time < ba.end_time + 15
//             {
//                 return true;
//             }
//         }
//     }
//
//     for i in 0..b.blocks.len()-1 {
//         for j in i+1..b.blocks.len() {
//             let ba = &b.blocks[i];
//             let bb = &b.blocks[j];
//
//             if ba.day == bb.day
//                 && ba.start_time < bb.end_time + 15
//                 && bb.start_time < ba.end_time + 15
//             {
//                 return true;
//             }
//         }
//     }
//
//     for ba in &a.blocks {
//         if ba.start_time == ba.end_time && ba.start_time == 0 {
//             continue;
//         }
//
//         for bb in &b.blocks {
//             if bb.start_time == bb.end_time && bb.start_time == 0 {
//                 continue;
//             }
//             if ba.day == bb.day
//                 && ba.start_time < bb.end_time + 15
//                 && bb.start_time < ba.end_time + 15
//             {
//                 return true;
//             }
//         }
//     }
//     false
// }

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
    a.start_time < b.end_time + 15
        && b.start_time < a.end_time + 15
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
