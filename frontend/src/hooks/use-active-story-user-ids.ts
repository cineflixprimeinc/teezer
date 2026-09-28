"use client";

import { useQuery } from "@tanstack/react-query";
import { storyService } from "@/services/story.service";
import { useAuthStore } from "@/store/auth.store";

export function useActiveStoryUserIds(): Set<number> {
  const { isAuthenticated } = useAuthStore();
  const { data } = useQuery({
    queryKey: ["active-story-user-ids"],
    queryFn: storyService.activeUserIds,
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });
  return new Set(data ?? []);
}
