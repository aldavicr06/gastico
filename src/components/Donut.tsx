import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { ReactNode } from 'react';

export type DonutSlice = { value: number; color: string };

/**
 * Lightweight donut chart drawn with react-native-svg (no chart library).
 * Each slice is a circle stroke with a dash offset.
 */
export function Donut({
  data,
  size = 160,
  stroke = 18,
  track,
  children,
}: {
  data: DonutSlice[];
  size?: number;
  stroke?: number;
  track: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  const gap = data.filter((d) => d.value > 0).length > 1 ? 4 : 0;

  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Start at 12 o'clock. A plain SVG rotate(); `origin` breaks on web. */}
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              if (d.value <= 0) return null;
              const len = (d.value / total) * c;
              const dash = Math.max(len - gap, 0.1);
              const el = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {children}
    </View>
  );
}
