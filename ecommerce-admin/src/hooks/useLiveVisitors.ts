import { useEffect, useState } from 'react';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function useLiveVisitors(initialValue = 47): number {
  const [count, setCount] = useState(initialValue);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((current) => {
        const delta = randomInt(2, 5);
        const sign = Math.random() > 0.5 ? 1 : -1;
        const next = current + delta * sign;
        return Math.max(40, Math.min(60, next));
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  return count;
}
