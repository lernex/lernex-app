'use client';

import { useEffect, useState } from 'react';
import type { Lesson } from '@/lib/schema';

type FypResponse = { topic: string; lesson: Lesson };

export default function FypPage() {
  const [data, setData] = useState<FypResponse | null>(null);

  useEffect(() => {
    fetch('/api/fyp')
      .then((r) => r.json())
      .then((d) => setData(d));
  }, []);

  if (!data) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{data.topic}</h2>
      <p>{data.lesson.content}</p>
      <div className="space-y-4">
        {data.lesson.questions?.map((q, i) => (
          <div key={i} className="border p-2 rounded">
            <p className="font-medium">{q.prompt}</p>
            <ul className="list-disc ml-4">
              {q.choices.map((c, j) => (
                <li key={j}>{c}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}