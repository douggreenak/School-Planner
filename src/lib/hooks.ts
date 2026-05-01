'use client';
// ============================================================
// Client-side data fetching hooks
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import type { SchoolClass, Homework, Exam, Task, ScheduleDisruption } from '@/types';

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { refetch(); }, [refetch]);

  // Optimistic update helper: lets callers change the cached data without
  // waiting for a network round-trip (delete a row, flip a checkbox, etc.).
  // Accepts either the next value or an updater function, mirroring setState.
  const mutate = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => (typeof next === 'function' ? (next as (p: T | null) => T | null)(prev) : next));
  }, []);

  return { data, loading, error, refetch, mutate };
}

export function useClasses() {
  return useFetch<SchoolClass[]>('/api/classes');
}

export function useHomework() {
  return useFetch<Homework[]>('/api/homework');
}

export function useExams() {
  return useFetch<Exam[]>('/api/exams');
}

export function useTasks() {
  return useFetch<Task[]>('/api/tasks');
}

export function useDisruptions() {
  return useFetch<ScheduleDisruption[]>('/api/disruptions');
}

// Mutation helpers
export async function apiPost<T>(url: string, body: T) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiPut<T>(url: string, body: T) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
