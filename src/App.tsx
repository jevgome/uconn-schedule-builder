import { useKeyboardFSM } from "./hooks/useKeyboardFSM";
import init, { generate_schedules_from_sections, get_sections_for_courses } from "./wasm_pkg/scheduler_wasm";
import { useEffect, useState, useRef, useCallback } from "react";
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
  selected?: boolean;
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

function DraggableBlock({ id, name, onDelete, selected }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const clampedTransform = transform
    ? { ...transform, x: Math.min(transform.x, 0) } // allow only left drag
    : null;

  const style: React.CSSProperties = {
    backgroundColor: transform?.x < -80 ? "#7f1d1d" : undefined,
    transform: CSS.Transform.toString(clampedTransform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 999999 : 1,
    position: isDragging ? "relative" : "relative",
    willChange: "transform",
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
      onMouseEnter={(e) => {
        if (!isDragging) {
          const btn = e.currentTarget.querySelector("button");
          if (btn) (btn as HTMLButtonElement).style.opacity = "1";
        }
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "0";
      }}
    >
      <div className="relative z-10 font-medium text-center text-sm tracking-wide">
        {name}
      </div>
      <div
        className="
          absolute top-0 right-0 h-full w-6
          bg-red-500
          rounded-r-lg
          cursor-pointer

          opacity-0
          group-hover:opacity-100
          transition-opacity duration-150

          flex items-stretch justify-stretch

          z-50
        "
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
      >
        {/* full invisible hit surface */}
        <div className="w-full h-full flex items-center justify-center pointer-events-none">
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
    </div>
  );
}

function WeeklyCalendar({ schedule }: { schedule: any[] }) {
  const days = ["Mo", "Tu", "We", "Th", "Fr"];

  const startHour = 8;
  const endHour = 20;
  const hours = endHour-startHour
  const totalMinutes = hours* 60;

  // color per course
  const getColor = (code: string) => {
    const colors = [
      "bg-indigo-500",
      "bg-pink-500",
      "bg-green-500",
      "bg-blue-500",
      "bg-purple-500",
      "bg-orange-500",
    ];
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash += code.charCodeAt(i);
    }
    return colors[hash % colors.length];
  };

  function formatTime(min: number) {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 === 0 ? 12 : hours % 12;

    return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }

  return (
    <div className="h-full flex items-stretch overflow-hidden">

      {/* TIME COLUMN */}
      <div className="w-14 pr-2 text-xs text-gray-400 flex flex-col h-full">
        {Array.from({ length: hours }).map((_, i) => (
          <div className="flex-1 flex items-start justify-end pr-1">
            {startHour + i}
          </div>
        ))}
      </div>

      {/* DAYS */}
      <div className="flex-1 grid grid-cols-5 gap-2 relative">

        {days.map((day) => (
          <div key={day} className="relative h-full">

            {/* Day label */}
            <div className="text-center text-sm font-semibold mb-1 text-gray-600 shrink-0">
              {day}
            </div>

            {/* Background grid */}
            <div className="relative flex flex-col h-full">
              {Array.from({ length: hours }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 border-t border-gray-200"
                />
              ))}

              {/* BLOCKS */}
              {schedule.flatMap((section, si) =>
                section.blocks.map((block: any, bi: number) => {
                  if (block.day !== day) return null;

                  const startOffset = block.start_min - startHour * 60;
                  const duration = block.end_min - block.start_min;

                  const top = (startOffset / totalMinutes) * 100;
                  const height = (duration / totalMinutes) * 100;

                  const code = `${section.subject} ${section.catalog_number}`;

                  return (
                    <div
                      key={`${si}-${bi}`}
                      className={`absolute left-1 right-1 ${getColor(
                        code
                      )} text-white rounded-xl p-2 shadow-lg`}
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
                          {section.class_section}
                        </div>
                      </div>

                      {/* time below */}
                      <div className="text-[10px] mt-1 opacity-80">
                        {formatTime(block.start_min)} - {formatTime(block.end_min)}
                      </div>
                    </div>
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

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<DraggableBlockData[]>([]);
  const [classesDataRaw, setClassesDataRaw] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Course[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  type FocusContext = "global" | "search" | "suggestions" | "blocks" | "schedules";
  const [focusContext, setFocusContext] = useState<FocusContext>("global");
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
    schedules: "SCHEDULES"
  };

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);

  const [lastKey, setLastKey] = useState<string | null>(null);

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

    const sectionsJson = get_sections_for_courses(
      selectedCodes,
      classesDataRaw,
      selectedCampuses
    );

    const sections = JSON.parse(sectionsJson);

    console.log("Updated Sections:", sections);

    setSections(sections);
    setInput("");
    setSuggestions([]);
    setFocusContext("search");
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

    // clamp selection to valid range
    const index = Math.min(
      selectedSuggestion,
      available.length - 1
    );

    const course = visibleSuggestions[selectedSuggestion];

    if (!course) return;

    addBlock(course);
  }, [suggestions, blocks, selectedSuggestion, addBlock]);

  const visibleSuggestions = suggestions.filter(
    (c) => !blocks.some((b) => b.code === c.code)
  );

  const effectiveSelectedSuggestion =
    focusContext === "search"
      ? 0
      : selectedSuggestion;

  const fsm = {
    global: {
      i: {
        next: "search",
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      g: {
        action: (_,ctx) => {
          ctx.runScheduler();
        },
      },

      b: {
        next: "blocks",
        action: (_, ctx) => {
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
        action: (_, ctx) => ctx.handleEnter(),
      },

      ArrowDown: {
        next: "suggestions",
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion(
            Math.min(1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      Tab: {
        next: "suggestions",
        action: (_, ctx) => {
          ctx.setSelectedSuggestion(
            Math.min(0, ctx.visibleSuggestions.length - 1)
          );
        },
      },
    },

    suggestions: {
      Enter: {
        action: (_, ctx) => ctx.handleEnter(),
      },

      Escape: {
        next: "search",
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      j: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      k: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.max(p - 1, 0)
          );
        },
      },

      ArrowDown: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      ArrowUp: {
        action: (_, ctx) => {
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
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      j: {
        action: (_, ctx) => {
          ctx.setSelectedBlockIndex((i: number) =>
            Math.min(i + 1, ctx.blocks.length - 1)
          );
        },
      },

      k: {
        action: (_, ctx) => {
          ctx.setSelectedBlockIndex((i: number) =>
            Math.max(i - 1, 0)
          );
        },
      },

      x: {
        action: (_, ctx) => {
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

      J: {
        action: (_,ctx) => {
          ctx.onMoveBlockDown?.();
        }
      },

      K: {
        action: (_,ctx) => {
          ctx.onMoveBlockUp?.();
        }
      },
      
      g: {
        action: (_,ctx) => {
          ctx.runScheduler();
        },
      },
    },

    schedules: {
      i: {
        next: "search",
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },
 
      j: {
        action: (_, ctx) => {
          ctx.setSelectedScheduleIndex((i: number | null) => {
            const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
            const local = i === null ? 0 : i - pageStart;

            const row = Math.floor(local / COLS);
            const col = local % COLS;

            const nextRow = Math.min(row + 1, ROWS - 1);

            const next = nextRow * COLS + col;
            return pageStart + next;
          });
        },
      },

      k: {
        action: (_, ctx) => {
          ctx.setSelectedScheduleIndex((i: number | null) => {
            const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
            const local = i === null ? 0 : i - pageStart;

            const row = Math.floor(local / COLS);
            const col = local % COLS;

            const nextRow = Math.max(row - 1, 0);

            const next = nextRow * COLS + col;
            return pageStart + next;
          });
        },
      },

      h: {
        action: (_, ctx) => {
          ctx.setSelectedScheduleIndex((i: number | null) => {
            const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
            const local = i === null ? 0 : i - pageStart;

            const row = Math.floor(local / COLS);
            const col = local % COLS;

            const nextCol = Math.max(col - 1, 0);

            const next = row * COLS + nextCol;
            return pageStart + next;
          });
        },
      },

      l: {
        action: (_, ctx) => {
          ctx.setSelectedScheduleIndex((i: number | null) => {
            const pageStart = (ctx.currentPage - 1) * PAGE_SIZE;
            const local = i === null ? 0 : i - pageStart;

            const row = Math.floor(local / COLS);
            const col = local % COLS;

            const nextCol = Math.min(col + 1, COLS - 1);

            const next = row * COLS + nextCol;
            return pageStart + next;
          });
        },
      },

      H: {
        action: (_,ctx) => {
          ctx.setCurrentPage((i: number) =>
            Math.max(i-1, 1)
          )
        },
      },

      L: {
        action: (_,ctx) => {
          ctx.setCurrentPage((i: number) =>
            Math.min(i+1, ctx.totalPages)
          )
        },
      },

      Enter: {
        action: (_, ctx) => {
          const i = ctx.selectedScheduleIndex;

          if (i === null) return;

          const schedule = ctx.schedules[i];
          if (!schedule) return;

          ctx.setSelectedSchedule(schedule);
          ctx.setSelectedScheduleIndex(i);
        },
      },
    }
  };

  // Scheduler call
  const runScheduler = async () => {
    if (sections.length === 0) {
      console.log("No sections available yet.");
      return;
    }

    await init();

    // =========================
    // STEP 1: GENERATE SCHEDULES
    // =========================
    const schedulesJson = generate_schedules_from_sections(sections);

    const schedules = JSON.parse(schedulesJson);
    setSchedules(schedules);

    if (schedules.length > 0) {
      setSelectedSchedule(schedules[0]);
      setSelectedScheduleIndex(0);
      setCurrentPage(1);
    }

    console.log("Num sections: ", sections.length);
    console.log("Found schedules:", schedules.length);
    console.log("Schedules:", schedules);

    // later you will:
    // setSchedules(schedules);
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
      focusContext === "suggestions"
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

  const getEnterCandidate = (): Course | undefined => {
    if (suggestions.length === 0) return undefined;

    return suggestions.find(
      (c) => !blocks.some((b) => b.code === c.code)
    );
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
    state: focusContext,
    setState: setFocusContext,

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
    }),

    fsm,
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

        buildCourses(classesData, coursesData);
        setClassesDataRaw(classesData);

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
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const recomputeSections = (blockList: DraggableBlockData[]) => {
    if(!classesDataRaw.length) return;
    const selectedCodes = blockList.map(b => b.code);

    const sectionsJson = get_sections_for_courses(
      selectedCodes,
      classesDataRaw,
      selectedCampuses
    );

    const sections = JSON.parse(sectionsJson);
    setSections(sections);
  };

  const removeBlock = (id: string) => {
    const updated = blocks.filter((block) => block.id !== id);
    setBlocks(updated);

    recomputeSections(updated);
  };

  const clearBlocks = () => {
    setBlocks([]);
    setSections([]);
  };

  const highlightMatch = (text: string, query: string) => {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <span style={{ backgroundColor: "yellow", fontWeight: "bold" }}>
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };


  const goGlobal = () => {
    setFocusContext("global");
    setSelectedSuggestion(0);
    searchInputRef.current?.blur();
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

  return (
    <div className="h-screen flex flex-col bg-gray-100 relative z-0">
      {/* HEADER */}
      <div className="h-14 w-full bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
        <div className="font-bold text-lg text-gray-800">
          UConn Schedule Builder
        </div>
        <div className="relative">
          <div className="flex items-center" ref={settingsRef}>
            {vimMode && (
              <div className="mr-3 text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 font-mono border border-gray-700 tracking-widest">
                -- {vimFocusLabelMap[focusContext] ?? focusContext} --
              </div>
            )}
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className="px-3 py-1 rounded-md hover:bg-gray-100"
            >
              Settings ⚙️
            </button>

            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg p-3 z-50">
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Vim mode</span>

                  <button
                    onClick={() => setVimMode(v => !v)}
                    className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                      vimMode ? "bg-blue-950" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                        vimMode ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      </div> {/* end header */}

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        <div className="w-[300px] h-full bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-hidden border-r border-gray-200">
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
                  onFocus={() => setFocusContext("search")}
                  onBlur={(e) => {
                    // delay so click on suggestion doesn't instantly kill state
                    setTimeout(() => {
                      const active = document.activeElement;
                      if (active !== searchInputRef.current) {
                        setFocusContext("global");
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
                {focusContext != "global" && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl z-50 border p-3">
                    {visibleSuggestions.map((course, index) => {
                      const candidate = getEnterCandidate();

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
                          onClick={() => addBlock(course)}
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
                    className="w-full px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center shadow-sm"
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
                    className="w-full px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center shadow-sm"
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

          {/* Generate button */}
          <div className="p-6 border-t border-gray-200 bg-gradient-to-br from-slate-50 to-blue-50">
            <button
              type="button"
              onClick={() => runScheduler()}
              className="w-full bg-blue-950 hover:bg-blue-900 text-white font-semibold py-3 rounded-xl shadow-lg"
            >
              Generate Schedules
            </button>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 bg-white p-4 overflow-hidden flex flex-col min-h-0">
          
          {/* HEADER LABEL */}
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">
              {selectedScheduleIndex !== null
                ? `Schedule ${selectedScheduleIndex + 1} / ${schedules.length}`
                : ""}
            </div>

            {selectedSchedule && (
              <div className="text-xs text-gray-500">
                {selectedSchedule.sections?.length ?? 0} sections
              </div>
            )}
          </div>

          {/* CALENDAR */}
          {!selectedSchedule ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              No schedules yet
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">
              <WeeklyCalendar schedule={selectedSchedule.sections} />
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div 
          className="w-[300px] bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-0 flex flex-col overflow-y-auto overflow-x-clip p-6 border-l border-gray-200"
          onClick={() => setFocusContext("blocks")}
        >

          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Your Classes ({blocks.length})
              </h2>

              <button
                onClick={clearBlocks}
                className="p-2 rounded-md hover:bg-red-100 text-red-600 transition"
                title="Clear all courses"
              >
                🗑️
              </button>
            </div>

            {/* TOP HALF */}
            <div className="h-[60%] overflow-y-auto">
              

              {blocks.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  📚 No courses added yet
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={blocks.map((b) => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col items-center w-full">
                      {blocks.map((block, index) => (
                        <DraggableBlock
                          key={block.id}
                          id={block.id}
                          name={block.code}
                          onDelete={removeBlock}
                          selected={focusContext === "blocks" && index === selectedBlockIndex}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

            </div>

            {/* DIVIDER */}
            <div className="border-t border-gray-300" />

            {/* BOTTOM HALF */}
            <div className="h-[30%] flex flex-col p-2">
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
                      }
                      }
                      className={`aspect-square rounded-md border text-sm font-semibold flex items-center justify-center transition
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
                  className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30"
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
                        className={`px-2 py-1 rounded ${
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
                  className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
