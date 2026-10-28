import { useCallback, useEffect, useRef } from "react";
import { Keyboard, Platform } from "react-native";

export default function useKeyboardFocusScroll() {
  const scrollRef = useRef(null);
  const inputRefs = useRef({});
  const scrollOffsetRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const pendingInputRef = useRef(null);
  const retryTimerRef = useRef(null);

  const measureAndScroll = useCallback(inputRef => {
    const input = inputRef?.current;
    const scroll = scrollRef.current;
    if (!input?.measureInWindow || !scroll?.measureInWindow || keyboardHeightRef.current <= 0) return;

    input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
      scroll.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
        // KeyboardAvoidingView resizes this viewport; use its measured visible area
        // rather than screen coordinates, which differ across Android/iOS windows.
        const visibleBottom = scrollY + scrollHeight;
        const availableHeight = Math.max(0, visibleBottom - scrollY);
        const visibleCenter = scrollY + availableHeight * 0.48;
        const inputCenter = inputY + inputHeight / 2;
        const nextOffset = Math.max(0, scrollOffsetRef.current + inputCenter - visibleCenter);

        scroll.scrollTo({ y: nextOffset, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, event => {
      keyboardHeightRef.current = Number(event?.endCoordinates?.height) || 0;
      if (pendingInputRef.current) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => measureAndScroll(pendingInputRef.current), 80);
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      pendingInputRef.current = null;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [measureAndScroll]);

  const onScroll = useCallback(event => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollToFocusedInput = useCallback(inputRef => {
    pendingInputRef.current = inputRef;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(
      () => measureAndScroll(inputRef),
      Platform.OS === "ios" ? 300 : 400
    );
  }, [measureAndScroll]);

  const inputRef = useCallback(key => node => {
    inputRefs.current[key] = node;
  }, []);

  const focusInput = useCallback(key => {
    const ref = inputRefs.current[key];
    scrollToFocusedInput({ current: ref });
  }, [scrollToFocusedInput]);

  return { scrollRef, onScroll, inputRef, focusInput, scrollToFocusedInput };
}
