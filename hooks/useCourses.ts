"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client-api";
import type { Course } from "@/types/platform";

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  async function refresh() {
    try {
      setIsLoading(true);
      setError("");
      const data = await apiFetch<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to load courses.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return {
    courses,
    isLoading,
    error,
    refresh,
  };
}
