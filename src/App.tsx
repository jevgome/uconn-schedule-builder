import init, { generate_schedules_wasm } from "./wasm_pkg/scheduler_wasm";
import { useEffect, useState, useRef } from "react";
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
  name: string;
}

interface BlockProps {
  id: string;
  name: string;
  onDelete: (id: string) => void;
}
function DraggableBlock({ id, name, onDelete }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative bg-blue-950 text-white rounded-2xl p-4 m-2 w-64 shadow-lg cursor-grab active:cursor-grabbing select-none ${
        isDragging 
          ? 'shadow-2xl scale-110 rotate-3 z-50' 
          : 'hover:shadow-2xl hover:scale-105 hover:-rotate-1'
      }`}
      onMouseEnter={(e) => {
        if (!isDragging) {
          const btn = e.currentTarget.querySelector("button");
          if (btn) (btn as HTMLButtonElement).style.opacity = "1";
          e.currentTarget.style.boxShadow = "0 25px 50px rgba(99, 102, 241, 0.4), 0 0 30px rgba(139, 92, 246, 0.3)";
        }
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "0";
        if (!isDragging) {
          e.currentTarget.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.1)";
        }
      }}
    >
      <div className="relative z-10 font-semibold text-center text-lg tracking-wide">
        {name}
      </div>
      <button
        className="absolute -top-3 -right-3 w-7 h-7 bg-red-600 hover:bg-red-700 cursor-pointer text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center text-sm font-bold shadow-lg transform hover:scale-110 hover:rotate-90"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [classesDataRaw, setClassesDataRaw] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<DraggableBlockData[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Course[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Scheduler call
  const runScheduler = async () => {
    if (classesDataRaw.length === 0) return;

    await init();

    const selectedCodes = blocks.map((b) => b.name);

    console.log("courses:", selectedCodes);

    const result = generate_schedules_wasm(
      selectedCodes,
      classesDataRaw,
    );

    console.log("Schedules:", result);
  };
  useEffect(() => {
    Promise.all([
      fetch("/uconn-schedule-builder/semesters/1268/classes.json").then((res) => res.json()),
      fetch("/uconn-schedule-builder/courses.json").then((res) => res.json()),
    ])
      .then(([classesData, coursesData]) => {
        const titleMap = new Map<string, string>();

        for (const c of coursesData) {
          const key = `${c.course} ${c.catalog_number}`;
          titleMap.set(key, c.name);
        }

        const uiCourses: Course[] = classesData.map((c: any) => {
          const code = `${c.subject} ${c.catalog_number}`;

          return {
            code,
            title: titleMap.get(code) ?? "Unknown Course",
          };
        });

        setCourses(uiCourses);
        setClassesDataRaw(classesData);
      })
      .catch((err) => console.error("Error loading courses:", err));
  }, []);
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
    if (!input.trim() || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    
    const query = input.toLowerCase().trim();
    const filtered = courses
      .filter((course) => {
        const fullName = course.code.toLowerCase();
        const courseName = (course.title ?? "").toLowerCase();
        return fullName.includes(query) || 
               courseName.includes(query);
      })
      .reduce((unique, course) => {
        if(!unique.find(c=>c.code === course.code)) {
          unique.push(course);
        }
        return unique;
      }, [] as Course[])
      .slice(0, 8);
    setSuggestions(filtered);
  }, [input, courses]);
  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(300, Math.min(800, e.clientX));
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = (course: Course) => {
    const courseName = course.code;
    
    if (blocks.some(block => block.name === courseName)) {
      return;
    }
    
    setBlocks((prev) => [
      ...prev,
      { 
        id: `${course.code}-${Date.now()}`, 
        name: courseName 
      },
    ]);
    setInput("");
    setSuggestions([]);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
  };

  const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      addBlock(suggestions[0]);
    }
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

  return (
    <div className="h-screen flex bg-gray-100">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out forwards;
        }
      `}</style>
      
      {/* Sidebar */}
      <div 
        className="bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl flex flex-col overflow-hidden relative"
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">UConn Schedule Builder</h1>
          <p className="text-gray-600 text-sm">Search and organize your courses</p>
        </div>

        {/* Search Section */}
        <div className="p-6">
          <div ref={searchRef} className="relative">
            <div className="relative transition-all duration-300 transform focus-within:scale-105">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputSubmit}
                placeholder="🔍 Search catalog # or title..."
                className="w-full px-4 py-3 text-base border-0 rounded-xl bg-white shadow-lg focus:shadow-xl focus:outline-none transition-all duration-300 ring-2 ring-transparent focus:ring-indigo-300 focus:ring-4"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  boxShadow: '0 8px 20px rgba(79, 70, 229, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)',
                }}
              />
              {input && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl z-50 border border-gray-100 p-3"
                   style={{
                     background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                     maxHeight: '250px',
                     overflowY: 'auto',
                     display: 'flex',
                     flexDirection: 'column',
                     gap: '8px'
                   }}>
                {suggestions.map((course, index) => {
                  const isAlreadyAdded = blocks.some(block => block.name === course.code);
                  
                  return (
                    <button
                      key={index}
                      className={`font-medium transition-all duration-200 text-left text-sm ${
                        isAlreadyAdded 
                          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed shadow-sm' 
                          : 'border-indigo-200 bg-white hover:border-indigo-400 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 hover:text-indigo-700 hover:shadow-md hover:transform hover:scale-102 text-gray-700 shadow-sm hover:shadow-lg'
                      }`}
                      style={{
                        width: '100%',
                        padding: '12px 16px 20px',
                        borderRadius: '8px',
                        border: '2px solid',
                        borderColor: isAlreadyAdded ? '#d1d5db' : '#c7d2fe',
                        display: 'block',
                        textAlign: 'left',
                        minHeight: '64px'
                      }}
                      onClick={() => !isAlreadyAdded && addBlock(course)}
                      disabled={isAlreadyAdded}
                    >
                      <div className="font-semibold">
                        {highlightMatch(course.code, input)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {highlightMatch(course.title, input)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Course Blocks */}
        <div className="flex-1 overflow-y-auto p-6">
          {blocks.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3 select-none">📚</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1 select-none">No courses yet</h3>
              <p className="text-gray-500 text-sm select-none">Start by searching above</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Your Schedule ({blocks.length} course{blocks.length !== 1 ? 's' : ''})
              </h2>
              <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={blocks.map(block => block.id)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col items-center">
                    {blocks.map((block) => (
                      <DraggableBlock 
                        key={block.id} 
                        id={block.id} 
                        name={block.name} 
                        onDelete={removeBlock} 
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
        <button onClick={() => runScheduler(courses)}>
          Generate Schedules
        </button>
        {/* Instructions */}
        {blocks.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">💡 Drag to reorder • Hover to delete</p>
          </div>
        )}

        {/* Resize Handle */}
        <div 
          className="absolute top-0 right-0 w-1 h-full bg-gray-300 hover:bg-indigo-400 cursor-col-resize transition-colors duration-200"
          onMouseDown={() => setIsResizing(true)}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 bg-white">
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-8xl mb-6 select-none">🎓</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4 select-none">Welcome to Schedule Builder</h2>
            <p className="text-gray-600 text-lg select-none">Use the sidebar to search and organize your courses</p>
            <p className="text-gray-500 text-sm mt-2 select-none">You can resize the sidebar by dragging its right edge</p>
          </div>
        </div>
      </div>
    </div>
  );
}
