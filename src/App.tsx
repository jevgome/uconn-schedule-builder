import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Draggable block component
interface BlockProps {
  id: string;
  name: string;
}

function DraggableBlock({ id, name }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px 20px",
    margin: "6px 0",
    background: "#4f46e5",
    color: "white",
    borderRadius: "0.5rem",
    textAlign: "center",
    cursor: "grab",
    width: 200,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {name}
    </div>
  );
}

// Main App
export default function App() {
  const [blocks, setBlocks] = useState<BlockProps[]>([]);

  useEffect(() => {
    fetch("/uconn-schedule-builder/courses.json")
      .then((res) => res.json())
      .then((data) => setBlocks(data));
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "#fff",
          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: "1rem" }}>Drag & Drop Courses</h1>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {blocks.map((block) => (
                <DraggableBlock key={block.id} id={block.id} name={block.name} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

