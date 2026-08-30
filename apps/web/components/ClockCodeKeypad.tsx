"use client";

import { useEffect } from "react";

interface EmployeeIdKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}

export function EmployeeIdKeypad({ value, onChange, onSubmit, busy }: EmployeeIdKeypadProps) {
  function addDigit(digit: string) {
    if (!busy && value.length < 4) onChange(`${value}${digit}`);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "Escape") {
        event.preventDefault();
        onChange("");
      } else if (event.key === "Enter" && value.length === 4 && !busy) {
        event.preventDefault();
        onSubmit();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <div className="clock-code-entry">
      <output className="clock-code-display" aria-label={`${value.length} employee ID digits entered`} aria-live="polite">
        {value || <span>Enter your 4-digit ID</span>}
      </output>
      <div className="numeric-keypad" aria-label="Numeric employee ID keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button type="button" className="keypad-key" onClick={() => addDigit(digit)} disabled={busy} key={digit}>{digit}</button>
        ))}
        <button type="button" className="keypad-key utility" onClick={() => onChange("")} disabled={busy || !value}>Clear</button>
        <button type="button" className="keypad-key" onClick={() => addDigit("0")} disabled={busy}>0</button>
        <button type="submit" className="keypad-key continue" disabled={busy || value.length !== 4}>{busy ? "Wait…" : "Continue"}</button>
      </div>
      <p className="code-privacy-note">Your employee ID is cleared when you finish or after a recorded punch.</p>
    </div>
  );
}
