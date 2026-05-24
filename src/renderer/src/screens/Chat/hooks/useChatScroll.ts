import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

/**
 * Auto-scroll behavior for the chat messages container.
 *
 * - Tracks whether the user has manually scrolled up; pauses auto-scroll in that case.
 * - Re-engages auto-scroll when a new user message is sent.
 * - Exposes the container ref and a bottom sentinel ref to be placed in JSX.
 */
export function useChatScroll(messages: ChatMessage[]): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback((force?: boolean) => {
    if (!force && userScrolledUpRef.current) return;
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, []);

  // Track manual scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleScroll(): void {
      const el = container!;
      // Check if user is within 60px of the bottom
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = atBottom;
      // Only mark as "user scrolled up" if they scrolled UP away from bottom
      // and we were previously at bottom (not if they scrolled down to bottom)
      if (!atBottom && wasAtBottom) {
        userScrolledUpRef.current = true;
      } else if (atBottom) {
        userScrolledUpRef.current = false;
      }
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on incoming messages; force-scroll when user sends a new one
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const userJustSent =
      messages.length > prevCount &&
      messages[messages.length - 1]?.role === "user";
    if (userJustSent) {
      userScrolledUpRef.current = false;
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => scrollToBottom(true));
    } else if (messages.length > prevCount) {
      // Agent/assistant message arrived - auto-scroll if near bottom
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(false));
      }
    }
  }, [messages, scrollToBottom]);

  return { containerRef, bottomRef };
}