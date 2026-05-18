"use client";

interface DataPoint { date: string; price: number; }

interface Props { data: DataPoint[]; }

export default function PriceChart({ data }: Props) {
  if (data.length < 2) return null;

  const W = 600, H = 180, PAD = { top: 12, right: 12, bottom: 28, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const xScale = (i: number) => (i / (data.length - 1)) * chartW;
  const yScale = (p: number) => chartH - ((p - minP) / range) * chartH;

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.price)}`).join(" ");

  const isUp = data[data.length - 1].price >= data[0].price;
  const lineColor = isUp ? "#16a34a" : "#dc2626";
  const fillColor = isUp ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)";

  const areaPath = `M0,${yScale(data[0].price)} ${data.map((d, i) => `L${xScale(i)},${yScale(d.price)}`).join(" ")} L${chartW},${chartH} L0,${chartH} Z`;

  // Y axis ticks
  const yTicks = [minP, (minP + maxP) / 2, maxP];

  // X axis: show first, middle, last date
  const xLabels = [
    { i: 0,              label: data[0].date },
    { i: Math.floor((data.length - 1) / 2), label: data[Math.floor((data.length - 1) / 2)].date },
    { i: data.length - 1, label: data[data.length - 1].date },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 300 }}
        aria-label="Gráfico de precio histórico"
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Grid lines */}
          {yTicks.map((v, i) => (
            <line key={i} x1={0} x2={chartW} y1={yScale(v)} y2={yScale(v)} stroke="#f0f0f0" strokeWidth={1} />
          ))}

          {/* Area fill */}
          <path d={areaPath} fill={fillColor} />

          {/* Price line */}
          <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

          {/* Y axis labels */}
          {yTicks.map((v, i) => (
            <text key={i} x={-6} y={yScale(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
              ${v.toFixed(0)}
            </text>
          ))}

          {/* X axis labels */}
          {xLabels.map(({ i, label }) => (
            <text key={i} x={xScale(i)} y={chartH + 16} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {label}
            </text>
          ))}

          {/* Last price dot */}
          <circle cx={xScale(data.length - 1)} cy={yScale(data[data.length - 1].price)} r={3} fill={lineColor} />
        </g>
      </svg>
    </div>
  );
}
