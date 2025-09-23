import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface BlockProps {
  id: string;
  label: string;
}

function DraggableBlock({ id, label }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px",
    margin: "6px 0",
    background: "#4f46e5",
    color: "white",
    borderRadius: "0.5rem",
    textAlign: "center",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {label}
    </div>
  );
}

export default function App() {
  const [blocks, setBlocks] = useState([
    { id: "1", label: "Math 101" },
    { id: "2", label: "CS 202" },
    { id: "3", label: "History 303" },
  ]);

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => (
          <DraggableBlock key={block.id} id={block.id} label={block.label} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

