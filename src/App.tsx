import { useEffect, useState } from "react";
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
  course: string;
  catalog_number: string;
}

interface DraggableBlockData {
  id: string;
  name: string;
}

interface BlockProps {
  id: string;
  name: string;
}

function DraggableBlock({
  id,
  name,
  onDelete,
}: BlockProps & { onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    position: "relative",
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px 20px",
    margin: "6px 0",
    background: "#4f46e5",
    color: "white",
    borderRadius: "0.5rem",
    width: 200,
    cursor: "grab",
    textAlign: "center",
    overflow: "visible",
  };

  const buttonStyle: React.CSSProperties = {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    lineHeight: 1,
    pointerEvents: "auto",
    opacity: 0,
    transition: "opacity 0.2s",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseEnter={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "0";
      }}
    >
      {name}
      <button
        style={buttonStyle}
        onClick={() => onDelete(id)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [blocks, setBlocks] = useState<DraggableBlockData[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Course[]>([]);

  useEffect(() => {
    fetch("/uconn-schedule-builder/courses.json")
      .then((res) => res.json())
      .then((data: Course[]) => setCourses(data))
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!input) return setSuggestions([]);
    const lower = input.toLowerCase();
    setSuggestions(
      courses
        .filter((c) => `${c.course} ${c.catalog_number}`.toLowerCase().includes(lower))
        .slice(0, 10)
    );
  }, [input, courses]);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = (course: Course) => {
    setBlocks((prev) => [
      ...prev,
      { id: `${course.course}-${course.catalog_number}-${Date.now()}`, name: `${course.course} ${course.catalog_number}` },
    ]);
    setInput("");
    setSuggestions([]);
  };

  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 250 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a course..."
          style={{ width: "100%", padding: 8, fontSize: 16 }}
        />
        {suggestions.length > 0 && (
          <ul style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            position: "absolute",
            top: "100%",
            left: 0,
            width: "100%",
            border: "1px solid #ccc",
            backgroundColor: "white",
            zIndex: 100,
            maxHeight: 200,
            overflowY: "auto"
          }}>
            {suggestions.map((c, i) => (
              <li
                key={i}
                style={{ padding: 8, cursor: "pointer" }}
                onClick={() => addBlock(c)}
              >
                {c.course} {c.catalog_number}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 40 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((block) => (
              <DraggableBlock key={block.id} id={block.id} name={block.name} onDelete={removeBlock} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

