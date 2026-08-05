import { useKeyboardFSM } from "./hooks/useKeyboardFSM";
import { Settings } from "lucide-react";
import type { FSM } from "./hooks/useKeyboardFSM";
import init, { generate_schedules_from_sections } from "./wasm_pkg/scheduler_wasm";
import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Course {
  code: string;
  title: string;
}

interface DraggableBlockData {
  id: string;
  code: string;
  title: string;
}

interface BlockProps {
  id: string;
  name: string;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  selected?: boolean;
}

type BreakBlock = {
  id: string;
  type: "break";
  name: string;
  days: string[]; // ["Mo","Tu","We"]
  start_time: number; // minutes from midnight
  end_time: number;
};

interface Professor {
  name: string;
  rating: number;
  num_ratings: number;
  link: string;
}

interface Schedule {
  sections: any[];
}


const CAMPUS_MAP: Record<string, string> = {
  STORR: "Storrs",
  AVYPT: "Avery Point",
  HRTFD: "Hartford",
  OFF: "Off-campus",
  LAW: "School of Law",
  STMFD: "Stamford",
  UCHC: "UConn Health Center",
  WTBY: "Waterbury",
};

const CAMPUSES = Object.keys(CAMPUS_MAP);

function isKeyboardDevice() {
  if (typeof window === "undefined") return false;

  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasHover = window.matchMedia("(hover: hover)").matches;

  return hasFinePointer && hasHover;
}

const DraggableBlock = memo(function DraggableBlock({ id, name, onDelete, selected, onEdit }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 999999 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative rounded-lg px-3 py-2 m-1 w-[180px] max-w-[180px] mx-auto text-sm select-none transition-all duration-150
        ${
          selected
            ? "bg-blue-900 text-white shadow-xl ring-2 ring-indigo-300 scale-[1.03]"
            : "bg-blue-950 text-white shadow-md hover:shadow-lg hover:scale-[1.01]"
        }
        cursor-grab active:cursor-grabbing
      `}
    >
      <div className="relative z-10 font-medium text-center text-sm tracking-wide">
        {name}
      </div>
      <div
        className="
          absolute top-0 left-0 h-full w-6
          bg-blue-500
          rounded-l-lg
          cursor-pointer
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          flex items-center justify-center
          z-50
        "
        onClick={(e) => {
          e.stopPropagation();
          onEdit(id); // NEW
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-white opacity-90"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 4a7.94 7.94 0 00-.34-2l2.1-1.64-2-3.46-2.49 1a8.12 8.12 0 00-1.73-1L16 2h-4l-.48 2.9a8.12 8.12 0 00-1.73 1l-2.49-1-2 3.46 2.1 1.64a7.94 7.94 0 000 4L5.3 15.64l2 3.46 2.49-1c.53.42 1.11.77 1.73 1L12 22h4l.48-2.9c.62-.23 1.2-.58 1.73-1l2.49 1 2-3.46-2.1-1.64c.22-.64.34-1.31.34-2z"/>
        </svg>
    </div>
      <div
        className="
          absolute top-0 right-0 h-full w-6
          bg-red-500
          rounded-r-lg
          cursor-pointer
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          flex items-center justify-center
          z-50
        "
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-white"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9z" />
        </svg>
      </div>
    </div>
  );
});

function WeeklyCalendar({
  schedule,
  hoverSchedule,
  professorMap,
  breakMode,
  breakBlocks,
  setBreakBlocks,
  setBreakMode,
}: {
  schedule: any[] | null;
  hoverSchedule: any[] | null;
  professorMap: Map<string, Professor>;
  breakMode: boolean;
  breakBlocks: BreakBlock[];
  setBreakBlocks: React.Dispatch<React.SetStateAction<BreakBlock[]>>;
  setBreakMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const days = ["Mo", "Tu", "We", "Th", "Fr"];

  const dayHeaderHeight = 32;
  const startHour = 8;
  const endHour = 22;
  const hours = endHour-startHour
  const totalMinutes = hours* 60;

  // color per course
  const getColor = (code: string) => {
    const colors = [
    "bg-indigo-700",
    "bg-slate-700",
    "bg-emerald-700",
    "bg-blue-700",
    "bg-purple-700",
    "bg-zinc-700",
  ];
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash += code.charCodeAt(i);
    }
    return colors[hash % colors.length];
  };

  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  const [dragStart, setDragStart] = useState<{
    dayIndex: number;
    minute: number;
  } | null>(null);

  const [dragCurrent, setDragCurrent] = useState<{
    dayIndex: number;
    minute: number;
  } | null>(null);

  const [breakHover, setBreakHover] = useState<{
    dayIndex: number;
    minute: number;
  } | null>(null);

  const formatTimeLabel = (min: number) => {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;

    const h = hours % 12 === 0 ? 12 : hours % 12;
    const suffix = hours >= 12 ? "PM" : "AM";

    return `${h}:${minutes.toString().padStart(2, "0")} ${suffix}`;
  };

  function formatTime(min: number) {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    const h = hours % 12 === 0 ? 12 : hours % 12;

    return `${h}:${minutes.toString().padStart(2, "0")}`;
  }

  const snapMinutes = (m: number) =>
    Math.round(m / 5) * 5;

  const positionToMinute = (y: number, height: number) => {
    const ratio = y / height;

    return snapMinutes(startHour * 60 + ratio * totalMinutes);
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-green-400";
    if (rating >= 4.0) return "text-green-300";
    if (rating >= 3.5) return "text-yellow-300";
    if (rating >= 3.0) return "text-orange-300";
    return "text-red-300";
  };

  const gridRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getMouseMinute = (
    e: React.MouseEvent,
    dayIndex: number
  ) => {
    const grid = gridRefs.current[dayIndex];

    if (!grid) return startHour * 60;

    const rect = grid.getBoundingClientRect();

    const y = Math.max(
      0,
      Math.min(e.clientY - rect.top, rect.height)
    );

    return positionToMinute(y, rect.height);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBreakMode(false);
        setDragStart(null);
        setDragCurrent(null);
        setBreakHover(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="h-full flex items-stretch overflow-hidden">

      {/* TIME COLUMN */}
      <div className="select-none w-14 pr-2 text-xs text-gray-400 flex flex-col h-full">
        {Array.from({ length: hours }).map((_, i) => (
          <div key={i} className="flex-1 flex items-start justify-end pr-1">
            {startHour + i <= 12 ? startHour+i : startHour+i-12}
          </div>
        ))}
      </div>

      {/* DAYS */}
      <div className="flex-1 grid grid-cols-5 gap-2 relative">

        {(dragStart && dragCurrent || (breakMode && breakHover)) && (() => {

          const start = dragStart ?? breakHover!;
          const end = dragCurrent ?? breakHover!;

          const startDay = Math.min(
            start.dayIndex,
            end.dayIndex
          );

          const endDay = Math.max(
            start.dayIndex,
            end.dayIndex
          );

          const startMinute = Math.min(
            start.minute,
            end.minute
          );

          const endMinute = Math.max(
            start.minute,
            end.minute
          );

          const left = (startDay / 5) * 100;
          const width = ((endDay - startDay + 1) / 5) * 100;

          const top =
            (dayHeaderHeight / (hours * 60)) * 100 +
            ((startMinute - startHour * 60) / totalMinutes) * 100;

          const height =
            ((endMinute - startMinute) / totalMinutes) * 100;

          return (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                top: `${top}%`,
                height: `${height}%`,
              }}
            >
              <div
                className="
                  select-none
                  absolute
                  bottom-full
                  mb-1
                  left-0
                  px-2
                  py-1
                  rounded-md
                  bg-blue-950
                  text-white
                  text-xs
                  font-medium
                  shadow-lg
                  whitespace-nowrap
                "
                draggable={false}
              >
                {days[startDay]}
                {startDay !== endDay ? `–${days[endDay]}` : ""}
                {" • "}
                {formatTimeLabel(startMinute)}
                {" – "}
                {formatTimeLabel(endMinute)}
              </div>

              <div className="select-none w-full h-full rounded-lg border-2 border-blue-950 bg-blue-500/20" />
            </div>
          );
        })()}

        {days.map((day, dayIndex) => (
        <div key={day} className="relative h-full flex flex-col">

          {/* Day label - Decoupled from drag events */}
          <div 
            aria-hidden="true"
            onDragStart={(e) => e.preventDefault()} // <-- The ultimate kill-switch for ghost dragging
            className="
              select-none 
              text-center 
              text-sm 
              font-semibold 
              mb-1 
              text-gray-600 
              shrink-0
            "
          >
            {day}
          </div>
          {/* Background grid - Mouse handlers moved here */}
          <div
            ref={(el) => {
              gridRefs.current[dayIndex] = el;
            }}
            className="relative flex flex-col h-full flex-1"
            onMouseDown={(e) => {
              e.preventDefault(); 

              if (!breakMode) return;

              setDragStart({
                dayIndex: days.indexOf(day),
                minute: getMouseMinute(e, days.indexOf(day)),
              });

              setDragCurrent({
                dayIndex: days.indexOf(day),
                minute: getMouseMinute(e, days.indexOf(day)),
              });
            }}
            onMouseMove={(e) => {
              const minute = getMouseMinute(e, days.indexOf(day));

              if (breakMode && !dragStart) {
                setBreakHover({
                  dayIndex: days.indexOf(day),
                  minute,
                });
                return;
              }

              if (!dragStart) return;

              setDragCurrent({
                dayIndex: days.indexOf(day),
                minute,
              });
            }}
            onMouseLeave={() => {
              if (!dragStart) {
                setBreakHover(null);
              }
            }}
            onMouseUp={() => {
              if (!dragStart || !dragCurrent) return;

              const startDay = Math.min(dragStart.dayIndex, dragCurrent.dayIndex);
              const endDay = Math.max(dragStart.dayIndex, dragCurrent.dayIndex);
              const startMinute = Math.min(dragStart.minute, dragCurrent.minute);
              const endMinute = Math.max(dragStart.minute, dragCurrent.minute);

              setBreakBlocks((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  type: "break",
                  name: "Break",
                  days: days.slice(startDay, endDay + 1),
                  start_time: startMinute,
                  end_time: endMinute,
                },
              ]);

              setDragStart(null);
              setDragCurrent(null);
              setBreakMode(false);
            }}
          >
            {Array.from({ length: hours }).map((_, i) => (
              <div key={i} className="flex-1 border-t border-gray-200" />
            ))}
              {/* BLOCKS */}
              {schedule !== null && (schedule.flatMap((section) =>
                section.blocks.map((block: any) => {
                  if (block.day !== day) return null;

                  const startOffset = block.start_time - startHour * 60;
                  const duration = block.end_time - block.start_time;

                  const top = (startOffset / totalMinutes) * 100;
                  const height = ((duration+10) / totalMinutes) * 100;
                  const normalizeProfessorNameKey = (name: string) => {
                    return name
                      .trim()
                      .replace(/\s+/g, " ")
                      .replace(/\s*\([^)]*\)\s*$/, "") // 👈 removes trailing "(SI)", "(TA)", etc.
                      .toLowerCase();
                  };

                  const code = `${section.subject} ${section.catalog_number}`;
                  const prof = professorMap.get(
                    normalizeProfessorNameKey(block.instructor ?? "")
                  );
                  const isHovered =
                    hoveredSection === section.registration_number;
                  return (

                      <div
                        key={`${section.subject}-${section.catalog_number}-${section.class_section}-${block.day}-${block.start_time}`}
                        onMouseEnter={() => setHoveredSection(section.registration_number)}
                        onMouseLeave={() => setHoveredSection(null)}
                        className={`select-none absolute left-1 right-1 rounded-xl pt-1 px-2 shadow-lg transition-all duration-150
                          ${getColor(code)}
                          text-white
                          ${hoveredSection && !isHovered ? "opacity-30" : "opacity-100"}
                          ${isHovered ? "ring-2 ring-white scale-[1.02] z-20" : ""}
                        `}
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                        }}
                      >
                      <div className="flex items-start justify-between text-xs font-semibold leading-tight">
                        {/* left: course code */}
                        <div className="truncate pr-2">
                          {code}
                        </div>

                        {/* right: class section */}
                        <div className="text-[10px] opacity-90 whitespace-nowrap text-right">
                          {section.registration_number}, {block.class_section}
                        </div>
                      </div>

                      {/* time below */}
                      <div className="text-[10px] opacity-80">
                        {formatTime(block.start_time)} - {formatTime(block.end_time)}{block.room ? ", " : ""} {block.room === "Pending Dept Room Assignment" ? "Room TBA" : block.room}
                      </div>

                      {/*Professor data*/}
                      <div className="text-[10px] opacity-80 w-full min-w-0 truncate flex items-center gap-1">
                        <span className="truncate">
                          {block.instructor ?? "TBA"}
                        </span>

                        {prof?.rating != null && (
                          <span
                            className={`flex items-center gap-[2px] shrink-0 ${getRatingColor(prof.rating)}`}
                          >
                            <span>★</span>
                            <span>{prof.rating.toFixed(1)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ))}
              {/* HOVER SCHEDULE OVERLAY */}
              {hoverSchedule != null &&
                hoverSchedule.flatMap((section) =>
                  section.blocks.map((block: any) => {
                    if (block.day !== day) return null;

                    const startOffset = block.start_time - startHour * 60;
                    const duration = block.end_time - block.start_time;

                    const top = (startOffset / totalMinutes) * 100;
                    const height = ((duration + 10) / totalMinutes) * 100;

                    const code = `${section.subject} ${section.catalog_number}`;

                    const color = getColor(code);
                    const overlayBgMap: Record<string, string> = {
                      "bg-indigo-700": "bg-indigo-400/30",
                      "bg-slate-700": "bg-slate-400/30",
                      "bg-emerald-700": "bg-emerald-400/30",
                      "bg-blue-700": "bg-blue-400/30",
                      "bg-purple-700": "bg-purple-400/30",
                      "bg-zinc-700": "bg-zinc-400/30",
                    };

                    const overlayBg = overlayBgMap[color] ?? "bg-white/20";

                    return (
                      <div
                        key={`hover-${section.subject}-${section.catalog_number}-${section.class_section}-${block.day}-${block.start_time}`}
                        className={`
                          select-none
                          absolute left-1 right-1 rounded-xl
                          border-2 border-dashed
                          ${color}
                          ${overlayBg}
                          opacity-60
                          pointer-events-none
                          z-30
                        `}
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          filter: "brightness(1.2)",
                        }}
                      />
                    );
                  })
                )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc";
}) {
  if (!active) {
    return <span className="text-gray-400 text-[10px]">⬍</span>;
  }

  return (
    <span className="text-[10px]">
      {direction === "asc" ? "▲" : "▼"}
    </span>
  );
}


export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesDataRaw, setCoursesDataRaw] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<DraggableBlockData[]>([]);
  const [classesDataRaw, setClassesDataRaw] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [hoverSchedule, setHoverSchedule] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Course[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  type State = "global" | "search" | "suggestions" | "blocks" | "schedules" | "edit";
  const [state, setState] = useState<State>("global");
  const [hasMovedSelection, setHasMovedSelection] = useState(false);
  const [vimMode, setVimMode] = useState(() => {
    if (typeof window === "undefined") return false;

    const saved = localStorage.getItem("vimMode");
    return saved === "true";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [selectedScheduleIndex, setSelectedScheduleIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const COLS = 4;
  const ROWS = 3;
  const PAGE_SIZE = COLS * ROWS; // 12

  const totalPages = Math.ceil(schedules.length / PAGE_SIZE);
  const paginatedSchedules = schedules.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const [showKofi, setShowKofi] = useState(false);
  const [selectedCampuses, setSelectedCampuses] = useState<string[]>(["STORR"]);
  const [campusOpen, setCampusOpen] = useState(false);
  const campusRef = useRef<HTMLDivElement>(null);

  const [semesterOpen, setSemesterOpen] = useState(false);
  const semesterRef = useRef<HTMLDivElement>(null);
  interface Semester {
    value: string;
    name: string;
  }

  const vimFocusLabelMap: Record<string, string> = {
    global: "NORMAL",
    search: "INSERT",
    suggestions: "SELECT",
    blocks: "BLOCKS",
    schedules: "SCHEDULES",
    edit: "EDIT",
  };

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const [professors, setProfessors] = useState<Professor[]>([]);

  const openBlockEditor = (id: string) => {
    setEditingBlockId(id);
    setState("edit");
  };

  const closeBlockEditor = () => {
    setEditingBlockId(null);
    setState("blocks");
  };

  const [sectionSelections, setSectionSelections] = useState<Record<string, Set<string>>>({});
  const [lastUpdatedText, setLastUpdatedText] = useState<string | null>(null);

  const addBlock = async (course: Course) => {
    const courseName = course.code;

    if (blocks.some(block => block.code === courseName)) {
      return;
    }


    const newBlocks = [
      ...blocks,
      {
        id: `${course.code}-${Date.now()}`,
        code: course.code,
        title: course.title,
      },
    ];
    setBlocks(newBlocks);

    // =========================
    // NEW: IMMEDIATE SECTION FETCH
    // =========================
    await init();

    const selectedCodes = newBlocks.map(b => b.code);

    const sections = classesDataRaw.filter((s) => selectedCodes.includes(s.subject + " " + s.catalog_number) && selectedCampuses.includes(s.campus));
    initializeSelections(sections);

    console.log("Updated Sections:", sections);

    setSections(sections);
    setInput("");
    setSuggestions([]);
    setState("search");
    setSelectedSuggestion(0);

    // optional but strongly recommended
    searchInputRef.current?.focus();
  };

  const handleEnter = useCallback(() => {
    if (suggestions.length === 0) return;

    const available = suggestions.filter(
      (c) => !blocks.some((b) => b.code === c.code)
    );

    if (available.length === 0) return;

    const course = visibleSuggestions[selectedSuggestion];

    if (!course) return;

    addBlock(course);
  }, [suggestions, blocks, selectedSuggestion, addBlock]);

  const visibleSuggestions = suggestions.filter(
    (c) => !blocks.some((b) => b.code === c.code)
  );

  const normalizeProfessorName = (name: string) => {
    return name
      .trim()              // remove leading/trailing spaces
      .replace(/\s+/g, " "); // collapse multiple spaces into one
  };
  const normalizeProfessorNameKey = (name: string) => {
    return name
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const professorMap = useMemo(() => {
    const map = new Map<string, Professor>();

    for (const prof of professors) {
      map.set(normalizeProfessorNameKey(prof.name), {
        ...prof,
        name: normalizeProfessorName(prof.name),
      });
    }

    return map;
  }, [professors]);
  
  const creditsMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const c of coursesDataRaw) {
      const key = `${c.course} ${c.catalog_number}`;
      map.set(key, c.num_credits);
    }

    return map;
  }, [coursesDataRaw]);

  const totalCredits = useMemo(() => {
    if (!selectedSchedule?.sections) return 0;

    const seen = new Set<string>();
    let total = 0;

    for (const s of selectedSchedule.sections) {
      const key = `${s.subject} ${s.catalog_number}`;

      seen.add(key);

      total += Number(creditsMap.get(key)) ?? 0;
    }

    return total;
  }, [selectedSchedule, creditsMap]);

  const fsm = {
    global: {
      i: {
        next: "search",
        action: (_: any, ctx: any) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      g: {
        action: (_: any, ctx: any) => {
          ctx.runScheduler();
        },
      },

      b: {
        next: "blocks",
        action: (_: any, ctx: any) => {
          if (!ctx.blocks || ctx.blocks.length === 0) return;

          // optional: mark selection system if you have one later
          ctx.setSelectedBlockIndex?.(0);

          // focus should leave input mode
          ctx.searchInputRef.current?.blur?.();
        },
      },

      s: {
        next: "schedules",
      },

    },

    search: {
      Enter: {
        action: (_: any, ctx: any) => ctx.handleEnter(),
      },

      ArrowDown: {
        next: "suggestions",
        action: (_: any, ctx: any) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion(
            Math.min(1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      Tab: {
        next: "suggestions",
        action: (_: any, ctx: any) => {
          ctx.setSelectedSuggestion(
            Math.min(0, ctx.visibleSuggestions.length - 1)
          );
        },
      },
    },

    suggestions: {
      Enter: {
        action: (_: any, ctx: any) => ctx.handleEnter(),
      },

      Escape: {
        next: "search",
        action: (_: any, ctx: any) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      j: {
        action: (_: any, ctx: any) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      k: {
        action: (_: any, ctx: any) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.max(p - 1, 0)
          );
        },
      },

      ArrowDown: {
        action: (_: any, ctx: any) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      ArrowUp: {
        action: (_: any, ctx: any) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.max(p - 1, 0)
          );
        },
      },
    },

    blocks: {
      i: {
        next: "search",
        action: (_: any, ctx: any) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      j: {
        action: (_: any, ctx: any) => {
          ctx.setSelectedBlockIndex((i: number) =>
            Math.min(i + 1, ctx.blocks.length - 1)
          );
        },
      },

      k: {
        action: (_: any, ctx: any) => {
          ctx.setSelectedBlockIndex((i: number) =>
            Math.max(i - 1, 0)
          );
        },
      },

      x: {
        action: (_: any, ctx: any) => {
          const idx = ctx.selectedBlockIndex;
          const block = ctx.blocks[idx];

          if (!block) return;

          ctx.removeBlock(block.id);

          const newLength = ctx.blocks.length - 1;
          ctx.setSelectedBlockIndex((i: number) =>
            Math.max(0, Math.min(i, newLength - 1))
          );
        },
      },

      e: {
        action: (_, ctx) => {
          const idx = ctx.selectedBlockIndex;
          const block = ctx.blocks[idx];
          if (!block) return;

          ctx.openBlockEditor?.(block.id);
        },
      },

      J: {
        action: (_: any, ctx: any) => {
          ctx.onMoveBlockDown?.();
        }
      },

      K: {
        action: (_: any, ctx: any) => {
          ctx.onMoveBlockUp?.();
        }
      },
      
      g: {
        action: (_: any, ctx: any) => {
          ctx.runScheduler();
        },
      },

      s: {
        next: "schedules",
      },
    },

    schedules: {
      i: {
        next: "search",
        action: (_: any, ctx: any) => {
          ctx.searchInputRef.current?.focus();
        },
      },
 
      j: {
        action: (_: any, ctx: any) => {
          const i = ctx.selectedScheduleIndex;
          const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
          const local = i === null ? 0 : i - pageStart;

          const row = Math.floor(local / COLS);
          const col = local % COLS;

          const nextRow = Math.min(row + 1, ROWS - 1);

          const next = nextRow * COLS + col;
          const index = pageStart + next;
          ctx.setSelectedScheduleIndex(index);

          ctx.setHoverSchedule(ctx.schedules[index]);
        },
      },

      k: {
        action: (_: any, ctx: any) => {
          const i = ctx.selectedScheduleIndex;
          const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
          const local = i === null ? 0 : i - pageStart;

          const row = Math.floor(local / COLS);
          const col = local % COLS;

          const nextRow = Math.max(row - 1, 0);

          const next = nextRow * COLS + col;
          const index = pageStart + next;
          ctx.setSelectedScheduleIndex(index);

          ctx.setHoverSchedule(ctx.schedules[index]);
        },
      },

      h: {
        action: (_: any, ctx: any) => {
          const i = ctx.selectedScheduleIndex;
          const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
          const local = i === null ? 0 : i - pageStart;

          const row = Math.floor(local / COLS);
          const col = local % COLS;

          const nextCol = Math.max(col - 1, 0);

          const next = row * COLS + nextCol;
          const index = pageStart + next;
          ctx.setSelectedScheduleIndex(index);

          ctx.setHoverSchedule(ctx.schedules[index]);
        },
      },

      l: {
        action: (_: any, ctx: any) => {
          const i = ctx.selectedScheduleIndex;
          const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
          const local = i === null ? 0 : i - pageStart;

          const row = Math.floor(local / COLS);
          const col = local % COLS;

          const nextCol = Math.min(col + 1, COLS - 1);

          const next = row * COLS + nextCol;
          const index = pageStart + next;
          ctx.setSelectedScheduleIndex(index);

          ctx.setHoverSchedule(ctx.schedules[index]);
        },
      },

      H: {
        action: (_: any, ctx: any) => {
          ctx.setCurrentPage((i: number) =>
            Math.max(i-1, 1)
          )
        },
      },

      L: {
        action: (_: any, ctx: any) => {
          ctx.setCurrentPage((i: number) =>
            Math.min(i+1, ctx.totalPages)
          )
        },
      },

      Enter: {
        action: (_: any, ctx: any) => {
          const i = ctx.selectedScheduleIndex;

          if (i === null) return;

          const schedule = ctx.schedules[i];
          if (!schedule) return;

          ctx.setSelectedSchedule(schedule);
          ctx.setSelectedScheduleIndex(i);
        },
      },

      b: {
        next: "blocks",
      },
    },

    edit: {
      q: {
        action: (_, ctx) => {
          const idx = ctx.selectedBlockIndex;
          const block = ctx.blocks[idx];
          if (!block) return;

          ctx.closeBlockEditor?.(block.id);
        },
      },
    },
  } as const satisfies FSM;

  const [showScheduleError, setShowScheduleError] = useState(false);

  const runScheduler = async () => {
    if (sections.length === 0) {
      console.log("No sections available yet.");
      return;
    }

    await init();

    // =========================
    // STEP 1: GENERATE SCHEDULES
    // =========================
    const filtered = sections.filter((s) => {
      const code = `${s.subject} ${s.catalog_number}`;
      return sectionSelections[code]?.has(s.registration_number);
    });

    if (filtered.length === 0) {
      console.log("No valid sections selected");
      setShowScheduleError(true);
      return;
    }

    const breakSections = breakBlocks.map((b) => ({
      subject: "BREAK",
      catalog_number: "",
      registration_number: b.id,
      blocks: b.days.map((day) => ({
        day,
        start_time: b.start_time,
        end_time: b.end_time,
        class_section: "BREAK",
        instructor: null,
        room: null,
      })),
    }));

    const schedulesJson =
    generate_schedules_from_sections([
      ...filtered,
      ...breakSections,
    ]);
    const schedules = JSON.parse(schedulesJson);

    setSchedules(schedules);

    if (schedules.length === 0) {
      setShowScheduleError(true);
      setSelectedSchedule(null);
      setSelectedScheduleIndex(null);
    } else {
      setShowScheduleError(false);
      setSelectedSchedule(schedules[0]);
      setSelectedScheduleIndex(0);
      setCurrentPage(1);
    }

    console.log("Num sections: ", sections.length);
    console.log("Found schedules:", schedules.length);
    console.log("Schedules:", schedules);
  };

  const scoreCourse = (course: Course, query: string) => {
    const q = query.toLowerCase().trim();
    const code = course.code.toLowerCase();
    const title = course.title.toLowerCase();

    let score = 0;

    // exact match = highest priority
    if (code === q) score += 100;

    // prefix match (very strong)
    if (code.startsWith(q)) score += 50;

    // includes match
    if (code.includes(q)) score += 30;
    if (title.includes(q)) score += 10;

    // bonus: closer position match
    const codeIndex = code.indexOf(q);
    if (codeIndex === 0) score += 20;

    return score;
  };

  const getGhostText = () => {
    if (!input.trim()) return "";

    const query = input.toLowerCase().trim();

    const baseCourse =
      state === "suggestions"
        ? visibleSuggestions[selectedSuggestion]
        : visibleSuggestions[0];

    if (!baseCourse) return "";

    const code = baseCourse.code;

    if (!code.toLowerCase().startsWith(query)) return "";

    const normalizedInput = input.replace(/\s+$/, " ");

    if (!code.toLowerCase().startsWith(normalizedInput.toLowerCase())) {
      return "";
    }

    return code.slice(normalizedInput.length);
  };

  const moveBlockDown = () => {
    setBlocks((prev) => {
      const i = selectedBlockIndex;
      if (i >= prev.length - 1) return prev;

      const newBlocks = [...prev];
      [newBlocks[i], newBlocks[i + 1]] = [newBlocks[i + 1], newBlocks[i]];

      setSelectedBlockIndex(i + 1);
      recomputeSections(newBlocks);
      return newBlocks;
    });
  };

  const moveBlockUp = () => {
    setBlocks((prev) => {
      const i = selectedBlockIndex;
      if (i <= 0) return prev;

      const newBlocks = [...prev];
      [newBlocks[i], newBlocks[i - 1]] = [newBlocks[i - 1], newBlocks[i]];

      recomputeSections(newBlocks);
      setSelectedBlockIndex(i - 1);
      return newBlocks;
    });
  };



  useKeyboardFSM({
    state: state,
    setState: setState,

    inputRef: searchInputRef,

    getContext: () => ({
      visibleSuggestions,
      suggestions,
      setBlocks,
      blocks,
      selectedSuggestion,
      setSelectedSuggestion,
      setSuggestions,
      handleEnter,
      searchInputRef,
      hasMovedSelection,
      setHasMovedSelection,
      vimMode,
      runScheduler,
      setSelectedBlockIndex,
      selectedBlockIndex,
      setSections,
      onMoveBlockUp: moveBlockUp,
      onMoveBlockDown: moveBlockDown,
      removeBlock,
      setCurrentPage,
      currentPage,
      totalPages,
      schedules,
      setSelectedSchedule,
      selectedSchedule,
      setSelectedScheduleIndex,
      selectedScheduleIndex,
      openBlockEditor,
      closeBlockEditor,
      setHoverSchedule
    }),

    fsm: fsm as FSM,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const semestersData = await fetch("/uconn-schedule-builder/semesters.json")
          .then(res => res.json());

        setSemesters(semestersData);

        // ✅ set default to FIRST semester
        const defaultSemester = semestersData[0];
        setSelectedSemester(defaultSemester);

        const [classesData, coursesData] = await Promise.all([
          fetch(`/uconn-schedule-builder/semesters/${defaultSemester.value}/classes.json`)
            .then(res => res.json()),
          fetch("/uconn-schedule-builder/courses.json")
            .then(res => res.json()),
        ]);

        setCoursesDataRaw(coursesData);
        buildCourses(classesData, coursesData);
        setClassesDataRaw(classesData);

        const professorsData = await fetch(
          "/uconn-schedule-builder/professors.json"
        ).then(res => res.json());

        setProfessors(professorsData);

      } catch (err) {
        console.error("Error loading data:", err);
      }
    };

    loadData();
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setHasMovedSelection(false);
    setSelectedSuggestion(0);
  }, [input]);

  useEffect(() => {
    if (!input.trim() || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const query = input.toLowerCase().trim();

    const ranked = courses
      .map((course) => ({
        course,
        score: scoreCourse(course, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.course);

    setSuggestions(ranked);
  }, [input, courses]);

  useEffect(() => {
    localStorage.setItem("vimMode", String(vimMode));
  }, [vimMode]);

  useEffect(() => {
    if (!isKeyboardDevice()) {
      setVimMode(false);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!settingsRef.current) return;

      if (!settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (campusRef.current && !campusRef.current.contains(target)) {
        setCampusOpen(false);
      }

      if (semesterRef.current && !semesterRef.current.contains(target)) {
        setSemesterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!selectedSemester) return;

    setSchedules([]);
    setSelectedSchedule(null);
    setSelectedScheduleIndex(null);
    setCurrentPage(1);

    setSections([]);
    setBlocks([]); // 👈 clears all selected courses


    const loadClasses = async () => {
      try {
        const [classesData, coursesData] = await Promise.all([
          fetch(`/uconn-schedule-builder/semesters/${selectedSemester.value}/classes.json`)
            .then(res => res.json()),
          fetch("/uconn-schedule-builder/courses.json")
            .then(res => res.json()),
        ]);

        buildCourses(classesData, coursesData);
        setClassesDataRaw(classesData);

      } catch (err) {
        console.error("Error loading semester data:", err);
      }
    };

    loadClasses();
  }, [selectedSemester]);

  useEffect(() => {
    fetch("/uconn-schedule-builder/time.txt")
      .then(res => res.text())
      .then(text => {
        const seconds = Number(text.trim());

        if (!Number.isFinite(seconds)) return;

        const updatedDate = new Date(seconds * 1000);

        setLastUpdatedText(
          updatedDate.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        );
      })
      .catch(() => {
        setLastUpdatedText(null);
      });
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://tally.so/widgets/embed.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const getBlockCode = (id: string) => {
    return blocks.find(b => b.id === id)?.code;
  };

  const initializeSelections = (sections: any[]) => {
    const map: Record<string, Set<string>> = {};

    sections.forEach((s) => {
      const key = `${s.subject} ${s.catalog_number}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(s.registration_number);
    });

    setSectionSelections(map);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, delta, over } = event;

    const SWIPE_THRESHOLD = -120; // how far left before delete

    // 🗑️ SWIPE DELETE
    if (delta.x < SWIPE_THRESHOLD) {
      setBlocks((prev) =>
        prev.filter((block) => block.id !== active.id)
      );
      return;
    }

    // 🔄 NORMAL SORTING
    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id);
        const newIndex = prev.findIndex(b => b.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const recomputeSections = (blockList: DraggableBlockData[]) => {
    if(!classesDataRaw.length) return;
    const selectedCodes = blockList.map(b => b.code);

    const updated = classesDataRaw.filter((s) => selectedCodes.includes(s.subject + " " + s.catalog_number) && selectedCampuses.includes(s.campus));
    initializeSelections(updated);
    setSections(updated);
  };

  const removeBlock = (id: string) => {
    const updated = blocks.filter((block) => block.id !== id);
    setBlocks(updated);

    recomputeSections(updated);
  };

  const clearBlocks = () => {
    setBlocks([]);
    setSections([]);
    setBreakBlocks([]);
  };

  const buildCourses = (classesData: any[], coursesData: any[]) => {
    const titleMap = new Map<string, string>();

    for (const c of coursesData) {
      const key = `${c.course} ${c.catalog_number}`;
      titleMap.set(key, c.name);
    }

    const courseMap = new Map<string, Course>();

    for (const c of classesData) {
      const code = `${c.subject} ${c.catalog_number}`;

      if (!courseMap.has(code)) {
        courseMap.set(code, {
          code,
          title: titleMap.get(code) ?? "Unknown Course",
        });
      }
    }

    setCourses(Array.from(courseMap.values()));
  };

  const hasValidSections = useMemo(() => {
    if (sections.length === 0) return false;

    const filtered = sections.filter((s) => {
      const code = `${s.subject} ${s.catalog_number}`;
      return sectionSelections[code]?.has(s.registration_number);
    });

    return filtered.length > 0;
  }, [sections, sectionSelections]);

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-green-400";
    if (rating >= 4.0) return "text-green-300";
    if (rating >= 3.5) return "text-yellow-300";
    if (rating >= 3.0) return "text-orange-300";
    return "text-red-300";
  };

  type ClassType = "Lecture" | "Discussion" | "Lab" | "Other";

  function getClassType(sectionClassSection: string): ClassType {
    if (!sectionClassSection) return "Other";

    const last = sectionClassSection.trim().slice(-1);

    if (/\d/.test(last)) return "Lecture";
    if (last === "D") return "Discussion";
    if (last === "L") return "Lab";

    return "Other";
  }

  function formatTime(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, "0")}`;
  }

  function getDayLabel(day: string) {
    return day; // already Mo/Tu/We/etc
  }

  type SortKey =
    | "section"
    | "instructor"
    | "seatsLeft"
    | "reservedSeatsLeft";

  type SortState = {
    primary: SortKey | null;
    secondary: SortKey | null;
    direction: "asc" | "desc";
  };

  const [sortState, setSortState] = useState<SortState>({
    primary: null,
    secondary: null,
    direction: "asc",
  });

  const toggleSort = (key: SortKey) => {
    setSortState(prev => {
      // first click → primary
      if (prev.primary !== key) {
        return {
          primary: key,
          secondary: prev.primary,
          direction: "asc",
        };
      }

      // second click → flip direction
      if (prev.primary === key) {
        return {
          ...prev,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }

      return prev;
    });
  };

  const sortedSections = useMemo(() => {
    if (!editingBlockId) return [];
    const code = getBlockCode(editingBlockId);
    if (!code) return [];

    const base = sections.filter(
      s => `${s.subject} ${s.catalog_number}` === code
    );

    const getInstructorRating = (section: any) => {
      const instructors =
        section.blocks?.map((b: any) => b.instructor).filter(Boolean) ?? [];

      const ratings = instructors.map((name: string) => {
        const cleaned = name.replace(/\s\([^)]*\)/g, "").trim();

        const prof = professorMap.get(
          normalizeProfessorNameKey(cleaned)
        );

        return prof?.rating ?? 0;
      });

      return ratings.length ? Math.max(...ratings) : 0;
    };

    const getValue = (section: any, key: SortKey) => {
      switch (key) {
        case "section":
          return Number(section.registration_number);

        case "instructor":
          return getInstructorRating(section);

        case "seatsLeft":
          return Number(section.seats_available ?? 0);

        case "reservedSeatsLeft": {
          const capacity = Number(section.enrollment_capacity ?? 0);
          const enrolled = Number(section.enrollment_total ?? 0);
          const nonReserved = Number(section.seats_available ?? 0);

          return capacity - enrolled - nonReserved;
        }

        default:
          return 0;
      }
    };

    const compare = (a: any, b: any) => {
      const keys = [
        sortState.primary,
        sortState.secondary,
      ].filter(Boolean) as SortKey[];

      for (const key of keys) {
        const av = getValue(a, key);
        const bv = getValue(b, key);

        if (av !== bv) {
          return sortState.direction === "asc" ? av - bv : bv - av;
        }
      }

      return 0;
    };

    return [...base].sort(compare);
  }, [sections, editingBlockId, sortState, professorMap]);

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [copiedReg, setCopiedReg] = useState<string | number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const [breakBlocks, setBreakBlocks] = useState<BreakBlock[]>([]);
  const [breakMode, setBreakMode] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-gray-100 relative z-0">
      {breakMode && (
        <div className="fixed top-0 left-0 right-0 z-[20000] bg-blue-950 text-white text-sm font-semibold py-2 text-center shadow-lg">
          Click and drag on the calendar to add a break
        </div>
      )}
      <div className="flex flex-1 overflow-hidden relative">
        {breakMode && (
          <div className="absolute inset-0 z-[15000] bg-black/40 pointer-events-none" />
        )}

        {/* LEFT SIDEBAR */}
        <div className={`w-[clamp(220px,18vw,300px)] h-full bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-hidden border-r border-gray-200 ${breakMode ? "pointer-events-none opacity-60" : ""}`}>
          <div className="relative h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
            <div className="font-bold text-lg text-gray-800">
              UConn Schedule Builder
            </div>
          </div>
          {/* TOP CONTENT */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search */}
            <div className="p-6">
              <div ref={searchRef} className="relative">

                {/* INPUT */}
                <input
                  ref={searchInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full px-4 py-3 text-base bg-white border border-gray-300 rounded-xl shadow-md
                             focus:outline-none focus:ring-2 focus:ring-blue-900 relative z-10"
                  placeholder="Search catalog # or title..."
                  onFocus={() => setState("search")}
                  onBlur={() => {
                    // delay so click on suggestion doesn't instantly kill state
                    setTimeout(() => {
                      const active = document.activeElement;
                      if (active !== searchInputRef.current) {
                        setState("global");
                      }
                    }, 0);
                  }}
                />

                {/* GHOST LAYER */}
                {getGhostText() && (
                  <div className="absolute inset-0 flex items-center px-4 py-3 pointer-events-none text-base z-20">
                    
                    {/* invisible input text to push cursor position */}
                    <span className="text-transparent whitespace-pre">
                      {input}
                    </span>

                    {/* ghost completion */}
                    <span className="text-gray-400 whitespace-pre">
                      {getGhostText()}
                    </span>

                  </div>
                )}

                {/* Suggestions Dropdown */}
                {state != "global" && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl z-50 border p-3">
                    {visibleSuggestions.map((course, index) => {
                      const isSelected =
                        hasMovedSelection
                          ? index === selectedSuggestion
                          : index === 0;


                      return (
                        <button
                          key={index}

                          className={`w-full text-left p-3 rounded-lg border text-sm transition-all duration-200
                            ${
                               isSelected
                                    ? "bg-indigo-100 border-blue-500 shadow-md"
                                    : "bg-white text-gray-700 border-blue-200 hover:bg-blue-50"
                            }
                          `}
                          onMouseDown={(e) => {
                            e.preventDefault(); // prevents input blur
                            addBlock(course);
                          }}
                        >
                          <div className="font-semibold">
                            {course.code}
                          </div>
                          <div className="text-xs mt-1">
                            {course.title}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6">
              <div className="flex gap-2">
                {/* CAMPUS DROPDOWN */}
                <div className="w-1/2 relative" ref={campusRef}>
                  {/* Button */}
                  <button
                    onClick={() => setCampusOpen((v) => !v)}
                    className="w-full px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center shadow-sm cursor-pointer"
                  >
                    <span>
                      {selectedCampuses.length === 0
                        ? "Select campus"
                        : selectedCampuses.length === 1
                          ? CAMPUS_MAP[selectedCampuses[0]]
                          : `${CAMPUS_MAP[selectedCampuses[0]]}, (+${selectedCampuses.length - 1})`}
                    </span>

                    <span className="text-gray-400">▾</span>
                  </button>

                  {/* Dropdown */}
                  {campusOpen && (
                    <div className="absolute z-50 mt-1 w-full left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg p-2">
                      {CAMPUSES.map((code) => {
                        const isSelected = selectedCampuses.includes(code);

                        return (
                          <label
                            key={code}
                            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedCampuses((prev) => {
                                  if (prev.includes(code)) {
                                    return prev.filter((c) => c !== code);
                                  }
                                  console.log(code);

                                  // ensure first selected stays first
                                  return [...prev, code];
                                });
                              }}
                            />
                            <span className="text-sm">
                              {CAMPUS_MAP[code]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="w-1/2 relative" ref={semesterRef}>
                  <button
                    onClick={() => setSemesterOpen((v) => !v)}
                    className="w-full px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center shadow-sm cursor-pointer"
                  >
                    {selectedSemester ? selectedSemester.name : "Semester"}
                    <span className="text-gray-400">▾</span>
                  </button>

                  {semesterOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg p-2">
                      {semesters.map((sem) => (
                        <button
                          key={sem.value}
                          onClick={() => {
                            setSelectedSemester(sem);
                            setSemesterOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm"
                        >
                          {sem.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showScheduleError && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
              No schedules could be generated. The selected course sections conflict
              with each other.
            </div>
          )}

          {/* Generate button */}
          <div className="p-6 border-t border-gray-200 bg-gradient-to-br from-slate-50 to-blue-50">
            <button
              type="button"
              onClick={() => {
                if (!hasValidSections) return;
                runScheduler();
              }}
              disabled={!hasValidSections}
              className={`
                w-full font-semibold py-3 rounded-xl shadow-lg transition-all duration-150
                ${
                  hasValidSections
                    ? "bg-blue-950 hover:bg-blue-900 text-white cursor-pointer"
                    : "bg-blue-950/60 text-white cursor-not-allowed shadow-none opacity-70"
                }
              `}
            >
              Generate Schedules
            </button>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 bg-white p-4 overflow-hidden flex flex-col min-h-0 relative z-0">
          
          {/* HEADER LABEL */}
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">
              {selectedScheduleIndex !== null
                ? `Schedule ${selectedScheduleIndex + 1} / ${schedules.length}`
                : "No schedules generated"}
            </div>

            <div className="flex items-center gap-3">
              {selectedSchedule && (
                <>
                  <div className="text-xs text-gray-500">
                    {selectedSchedule.sections?.length ?? 0} sections • {totalCredits} credits
                  </div>

                  <button
                    onClick={() => setShowEnrollModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-950 text-white text-sm font-medium hover:bg-blue-900 transition cursor-pointer"
                  >
                    Enroll
                  </button>
                </>
              )}
            </div>
          </div>

          {/* CALENDAR */}
          {!selectedSchedule ? (
            <div
              className={`flex-1 min-h-0 overflow-hidden ${
                breakMode ? "cursor-crosshair" : ""
              }`}
            >
              <WeeklyCalendar
                schedule={null}
                hoverSchedule={null}
                professorMap={professorMap}
                breakMode={breakMode}
                breakBlocks={breakBlocks}
                setBreakBlocks={setBreakBlocks}
                setBreakMode={setBreakMode}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">
              <WeeklyCalendar
                schedule={selectedSchedule.sections}
                hoverSchedule={hoverSchedule?.sections}
                professorMap={professorMap}
                breakMode={breakMode}
                breakBlocks={breakBlocks}
                setBreakBlocks={setBreakBlocks}
                setBreakMode={setBreakMode}
              />
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className={`w-[clamp(220px,18vw,300px)] h-full bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-hidden border-l border-gray-200 ${
          breakMode ? "pointer-events-none opacity-60" : ""
        }`}>
          <div className="relative h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
             <div className="flex items-center">
               {vimMode && (
                 <div className="mr-3 text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 font-mono border border-gray-700 tracking-widest">
                   -- {vimFocusLabelMap[state] ?? state} --
                 </div>
               )}
            </div>
            <div
             className="absolute right-4 flex items-center"
             ref={settingsRef}
            >
              <button
                onClick={() => setSettingsOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 hover:cursor-pointer transition"
              >
                <Settings className="w-5 h-5 text-gray-700" />
              </button>

              {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border rounded-lg shadow-lg p-3 z-[9999]">
                <button
                  onClick={() => setVimMode(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-100 text-sm transition mb-1"
                >
                  <span>Vim mode</span>

                  <div
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                      vimMode ? "bg-blue-950" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                        vimMode ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </div>
                </button>

                {/* Ko-fi Tip Button */}
                <button
                  onClick={() => {
                    setShowKofi(true);
                    setSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 text-sm transition mb-1"
                >
                  <span>Donate</span>
                </button>

                <button 
                  data-tally-open="ZjZJz0" data-tally-layout="modal" data-tally-width="700" data-tally-hide-title="1" data-tally-auto-close="1000"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 text-sm transition mb-1"
                  onClick={() => {
                    setSettingsOpen(false);
                  }}
                >
                    Send feedback / Report bug
                </button>
              </div>
            )}
            </div>
          </div>

          <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Your Classes ({blocks.length})
                </h2>

                <button
                  onClick={() => setBreakMode(true)}
                  className="px-3 py-1 text-sm rounded-md text-blue-900 hover:bg-blue-100 hover:cursor-pointer"
                >
                  Add Break
                </button>
              </div>

              {blocks.length + breakBlocks.length !== 0 && (
                <button
                  onClick={clearBlocks}
                  className="p-2 rounded-md hover:bg-red-100 text-red-600 text-sm transition cursor-pointer"
                  title="Clear all courses"
                >
                  Clear
                </button>
              )}

            </div>

            {/* TOP HALF */}
            <div className="h-[60%] overflow-y-auto">
              

              {blocks.length === 0 && breakBlocks.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  📚 No courses or breaks added yet
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  autoScroll={false}
                >
                  <SortableContext
                    items={[
                      ...blocks.map((b) => b.id),
                      ...breakBlocks.map((b) => b.id),
                    ]}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col items-center w-full">
                      {blocks.map((block, index) => (
                        <DraggableBlock
                          key={block.id}
                          id={block.id}
                          name={block.code}
                          onDelete={removeBlock}
                          onEdit={openBlockEditor}
                          selected={state === "blocks" && index === selectedBlockIndex}
                        />
                      ))}

                      {breakBlocks.map((b) => (
                        <DraggableBlock
                          key={b.id}
                          id={b.id}
                          name={`BREAK • ${formatTime(b.start_time)}-${formatTime(b.end_time)}`}
                          onDelete={() =>
                            setBreakBlocks(prev =>
                              prev.filter(x => x.id !== b.id)
                            )
                          }
                          onEdit={() => {}}
                          selected={false}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* BOTTOM HALF */}
            <div className="h-[30%] flex flex-col">
              <h2 className="text-m font-semibold pb-1">
                Generated Schedules
              </h2>
              {/* GRID */}
              <div className="grid grid-cols-4 grid-rows-3 gap-2 flex-1">
                {paginatedSchedules.map((schedule, index) => {
                  const globalIndex = (currentPage - 1) * PAGE_SIZE + index;

                  return (
                    <button
                      key={globalIndex}
                      onClick={() => {
                        setSelectedSchedule(schedule);
                        setSelectedScheduleIndex(globalIndex);
                      }}
                      onMouseEnter={()=> {
                          setHoverSchedule(schedule);
                      }}
                      onMouseLeave={()=> {
                          setHoverSchedule(null);
                      }}
                      className={`aspect-square rounded-md border text-sm font-semibold flex items-center justify-center transition cursor-pointer
                        ${
                          selectedScheduleIndex === globalIndex
                            ? "bg-blue-950 text-white border-indigo-700 shadow-md"
                            : "bg-white hover:bg-indigo-50 border-gray-300"
                        }
                      `}
                    >
                      {globalIndex + 1}
                    </button>
                  );
                })}
              </div>

              {/* PAGINATION */}
              <div className="mt-2 flex items-center justify-center gap-2 text-sm">

                {/* PREV */}
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 cursor-pointer"
                >
                  ←
                </button>

                {/* PAGE NUMBERS */}
                {Array.from({ length: totalPages }).map((_, i) => {
                  const page = i + 1;

                  // Google-style truncation
                  if (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-2 py-1 rounded cursor-pointer ${
                          currentPage === page
                            ? "bg-blue-950 text-white"
                            : "hover:bg-gray-200"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  }

                  // Ellipsis
                  if (
                    page === currentPage - 2 ||
                    page === currentPage + 2
                  ) {
                    return <span key={page}>...</span>;
                  }

                  return null;
                })}

                {/* NEXT */}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 cursor-pointer"
                >
                  →
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
      {editingBlockId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-9xl h-full max-h-[95vh] flex flex-col overflow-hidden rounded-2xl border border-black bg-white">
            {/* Header */}
            <div className="relative flex items-center justify-between px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {getBlockCode(editingBlockId)}
                </h2>
                <p className="text-sm text-blue-950">
                  {sortedSections.length} Available class sections
                </p>
              </div>

              {/* Center warning */}
              {lastUpdatedText && (
                <div className="absolute left-1/2 -translate-x-1/2 text-center">
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
                    Enrollment data last updated:{" "}
                    <span className="font-semibold">
                      {lastUpdatedText}
                    </span>
                  </div>
                </div>
              )}

              <button
                className="cursor-pointer rounded-md px-3 py-1 text-sm hover:bg-black hover:text-white"
                onClick={closeBlockEditor}
              >
                ✕
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[40px_90px_220px_190px_190px_110px_110px_150px_220px_50px] text-gray-800 text-sm font-medium px-4 py-3 border-b-4 border-gray-200">
              <div>
                <input
                  type="checkbox"
                  className="cursor-pointer accent-black"
                  checked={(() => {
                    const code = getBlockCode(editingBlockId);
                    if (!code) return false;

                    const matchingSections = sections.filter(
                      s =>
                        `${s.subject} ${s.catalog_number}` === code
                    );

                    const selectedCount =
                      sectionSelections[code]?.size ?? 0;

                    return (
                      matchingSections.length > 0 &&
                      selectedCount === matchingSections.length
                    );
                  })()}
                  onChange={() => {
                    const code = getBlockCode(editingBlockId);
                    if (!code) return null;

                    const matchingSections = sections.filter(
                      s =>
                        `${s.subject} ${s.catalog_number}` === code
                    );

                    const currentSelections =
                      sectionSelections[code] ?? new Set();

                    const hasAnySelected =
                      currentSelections.size > 0;

                    setSectionSelections(prev => {
                      const next = { ...prev };

                      if (hasAnySelected) {
                        next[code] = new Set();
                      } else {
                        next[code] = new Set(
                          matchingSections.map(
                            s => s.registration_number
                          )
                        );
                      }

                      return next;
                    });
                  }}
                />
              </div>

              <div className="flex items-center gap-1">
                Section
                <button className="hover:cursor-pointer" onClick={() => toggleSort("section")}>
                  <SortIcon
                    active={sortState.primary === "section"}
                    direction={sortState.direction}
                  />
                </button>
              </div>
              <div className="flex items-center gap-1">
                Instructor(s)
                <button className="hover:cursor-pointer" onClick={() => toggleSort("instructor")}>
                  <SortIcon
                    active={sortState.primary === "instructor"}
                    direction={sortState.direction}
                  />
                </button>
              </div>
              <div>Times</div>
              <div>Location</div>
              <div>Max Capacity</div>
              <div>Enrolled</div>
              <div className="flex flex-col leading-tight">
                <div className="flex items-center gap-1">
                  Open Seats Left
                  <button className="hover:cursor-pointer" onClick={() => toggleSort("seatsLeft")}>
                    <SortIcon
                      active={sortState.primary === "seatsLeft"}
                      direction={sortState.direction}
                    />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                Reserved Seats Left
                <button className="hover:cursor-pointer" onClick={() => toggleSort("reservedSeatsLeft")}>
                  <SortIcon
                    active={sortState.primary === "reservedSeatsLeft"}
                    direction={sortState.direction}
                  />
                </button>
              </div>
              <div>Waitlist</div>
            </div>

            {/* Sections */}
            <div className="overflow-y-auto flex-1 min-h-0 pb-6">
              {sortedSections.map((section, i) => {
                  const code = `${section.subject} ${section.catalog_number}`;
                  if (!code) return null;

                  const isChecked =
                    sectionSelections[code]?.has(
                      section.registration_number
                    );
                  const groupedTimes = (() => {
                    type Entry = {
                      days: Set<string>;
                    };

                    const map: Record<
                      string,
                      Record<string, Entry>
                    > = {};

                    for (const b of section.blocks ?? []) {
                      const type = getClassType(b.class_section);

                      const time = `${formatTime(b.start_time)}-${formatTime(b.end_time)}`;
                      const day = getDayLabel(b.day);

                      if (!map[type]) map[type] = {};
                      if (!map[type][time]) {
                        map[type][time] = { days: new Set() };
                      }

                      map[type][time].days.add(day);
                    }

                    return map;
                  })();

                  const groupedLocations = (() => {
                    type Entry = {
                      rooms: Set<string>;
                    };

                    const map: Record<
                      string,
                      Record<string, Entry>
                    > = {};

                    for (const b of section.blocks ?? []) {
                      const type = getClassType(b.class_section);
                      const room = b.room || "TBA";

                      if (!map[type]) map[type] = {};
                      if (!map[type][room]) {
                        map[type][room] = { rooms: new Set() };
                      }

                      map[type][room].rooms.add(room);
                    }

                    return map;
                  })();

                  const TYPE_ORDER: Record<string, number> = {
                    Lecture: 0,
                    Discussion: 1,
                    Lab: 2,
                    Other: 3,
                  };

                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[40px_90px_220px_190px_190px_110px_110px_150px_220px_50px] items-center border-b border-black/10 px-4 py-3 text-sm bg-slate-50 hover:bg-blue-950/5"
                    >
                      <div>
                        <input
                          type="checkbox"
                          className="cursor-pointer accent-black"
                          checked={isChecked}
                          onChange={() => {
                            setSectionSelections(prev => {
                              const next = { ...prev };
                              const set = new Set(next[code]);

                              if (
                                set.has(section.registration_number)
                              ) {
                                set.delete(
                                  section.registration_number
                                );
                              } else {
                                set.add(
                                  section.registration_number
                                );
                              }

                              next[code] = set;
                              return next;
                            });
                          }}
                        />
                      </div>

                      <div className="font-medium">
                        {section.registration_number}, {section.class_section}
                      </div>
                      <div className="text-blue-950 flex flex-col gap-1 min-w-0 pr-8">
                        {(() => {
                          const instructors =
                            (section.blocks
                              ?.map((b: any) => b.instructor)
                              .filter(Boolean) as string[]) || [];

                          // normalize + dedupe
                          const uniqueInstructors = Array.from(
                            new Set(
                              instructors.map((name) =>
                                name.replace(/\s\([^)]*\)/g, "").trim()
                              )
                            )
                          );

                          if (uniqueInstructors.length === 0) {
                            return <span className="text-gray-500">TBA</span>;
                          }

                          return uniqueInstructors.map((rawName, idx) => {
                            const normalized = normalizeProfessorNameKey(rawName);
                            const prof = professorMap.get(normalized);

                            return (
                              <div
                                key={`${rawName}-${idx}`}
                                className="flex items-center gap-2 min-w-0"
                              >
                                {/* Name + icon */}
                                {prof?.link ? (
                                  <a
                                    href={prof.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-blue-900 hover:underline transition min-w-0"
                                    title="View on RateMyProfessor"
                                  >
                                    {/* Truncated name */}
                                    <span className="truncate min-w-0">{rawName}</span>

                                    {/* Icon */}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                      className="w-4 h-4 shrink-0"
                                    >
                                      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                                      <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className="truncate min-w-0 flex-1">{rawName}</span>
                                )}

                                {/* Rating */}
                                {prof?.rating != null && (
                                  <span
                                    className={`flex items-center gap-[2px] shrink-0 whitespace-nowrap ${getRatingColor(
                                      prof.rating
                                    )}`}
                                  >
                                    <span>★</span>
                                    <span>{prof.rating.toFixed(1)}</span>
                                  </span>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="text-gray-700 flex flex-col gap-1 min-w-0">
                        {Object.keys(groupedTimes).length === 0 ? (
                          <span className="text-gray-400">TBA</span>
                        ) : (
                          Object.entries(groupedTimes).sort(
                            ([typeA], [typeB]) => {
                              return (TYPE_ORDER[typeA] ?? 99) - (TYPE_ORDER[typeB] ?? 99);
                            }
                          )
                          .map(([type, timeMap]) => (
                            <div key={type} className="text-xs text-gray-700">
                              {Object.entries(timeMap).map(([time, data], idx) => {
                                const days = [...data.days].join("/");

                                return (
                                  <div key={`${type}-${time}-${idx}`} className="leading-tight">
                                    <span className="font-semibold text-blue-950">
                                      {type}:
                                    </span>{" "}
                                    <span className="text-gray-500">{days}</span>{" "}
                                    <span className="text-gray-500">{time}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="text-gray-700 flex flex-col gap-1 min-w-0">
                        {Object.keys(groupedLocations).length === 0 ? (
                          <span className="text-gray-400">TBA</span>
                        ) : (
                          Object.entries(groupedLocations)
                            .sort(([typeA], [typeB]) => {
                              return (
                                (TYPE_ORDER[typeA] ?? 99) -
                                (TYPE_ORDER[typeB] ?? 99)
                              );
                            })
                            .map(([type, roomMap]) => (
                              <div key={type} className="text-xs text-gray-700">
                                {Object.entries(roomMap).map(([room], idx) => (
                                  <div
                                    key={`${type}-${room}-${idx}`}
                                    className="leading-tight"
                                  >
                                    <span className="font-semibold text-blue-950">
                                      {type}:
                                    </span>{" "}
                                    <span className="text-gray-500">{room}</span>
                                  </div>
                                ))}
                              </div>
                            ))
                        )}
                      </div>
                      <div>{section.enrollment_capacity}</div>
                      <div>{section.enrollment_total}</div>
                      <div>{section.seats_available}</div>
                      <div className="whitespace-pre-line leading-tight">
                          {typeof section.capacity_available === "string"
                          ? section.capacity_available
                              // insert newline before a number that follows text
                              .replace(/([A-Za-z\)])(\d+)/g, "$1\n$2")
                          : section.capacity_available}
                      </div>
                      <div>{section.waitlist_available}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {showKofi && (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">

        <div className="relative w-[420px] max-w-[95vw] rounded-2xl bg-white shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">
              Support development
            </h2>

            <button
              onClick={() => setShowKofi(false)}
              className="text-gray-500 hover:text-black text-lg leading-none hover:cursor-pointer"
            >
              ×
            </button>
          </div>

          {/* Ko-fi iframe */}
          <iframe
            id="kofiframe"
            src="https://ko-fi.com/jevgome/?hidefeed=true&widget=true&embed=true&preview=true"
            title="jevgome"
            className="w-full bg-[#f9f9f9]"
            style={{
              border: "none",
              padding: "4px",
              height: "712px"
            }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            allow="payment"
         />
        </div>

      </div>
    )}

    {showEnrollModal && selectedSchedule && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-5xl h-full max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-black bg-white">

          {/* Header */}
          <div className="relative flex items-center justify-between px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Enrollment Numbers
              </h2>
              <p className="text-sm text-blue-950">
                Copy these registration numbers and paste them into{" "}
                <a
                  href="https://studentadmin.uconn.edu/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-700"
                >
                  Student Admin ↗
                </a>
                {" "}when enrolling.
              </p>
              <p className="text-sm text-blue-950">
                From the home page: "Manage Classes" -&gt; "Class Search and Enroll"
              </p>
            </div>

            <button
              className="cursor-pointer rounded-md px-3 py-1 text-sm hover:bg-black hover:text-white"
              onClick={() => setShowEnrollModal(false)}
            >
              ✕
            </button>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[1fr_180px_120px] text-gray-800 text-sm font-medium px-6 py-3 border-b-4 border-gray-200">
            <div>Course</div>
            <div>Registration Number</div>
            <div></div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 min-h-0 pb-6">
            {selectedSchedule.sections.map((section: any) => (
              <div
                key={section.registration_number}
                className="grid grid-cols-[1fr_180px_120px] items-center border-b border-black/10 px-6 py-3 text-sm bg-slate-50 hover:bg-blue-950/5"
              >
                <div className="font-medium">
                  {section.subject} {section.catalog_number}
                </div>

                <div>
                  <code className="font-mono text-blue-950">
                    {section.registration_number}
                  </code>
                </div>

                <div>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        String(section.registration_number)
                      );

                      setCopiedReg(section.registration_number);

                      setTimeout(() => {
                        setCopiedReg((current) =>
                          current === section.registration_number
                            ? null
                            : current
                        );
                      }, 2000);
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition cursor-pointer ${
                      copiedReg === section.registration_number
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-950 text-white hover:bg-blue-900"
                    }`}
                  >
                    {copiedReg === section.registration_number
                      ? "Copied!"
                      : "Copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 bg-slate-50">
            <button
              onClick={async () => {
                const text = selectedSchedule.sections
                  .map(
                    (s: any) =>
                      `${s.subject} ${s.catalog_number}: ${s.registration_number}`
                  )
                  .join("\n");

                await navigator.clipboard.writeText(text);

                setCopiedAll(true);

                setTimeout(() => setCopiedAll(false), 2000);
              }}
              className={`w-full rounded-xl py-3 font-semibold transition cursor-pointer ${
                copiedAll
                  ? "bg-green-600 text-white"
                  : "bg-blue-950 text-white hover:bg-blue-900"
              }`}
            >
              {copiedAll
                ? "Copied!"
                : "Copy All Registration Numbers"}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
