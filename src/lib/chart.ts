/** Render a measurement records file to a PNG chart. */

import { writeFile } from 'node:fs/promises';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration, ChartDataset } from 'chart.js';
import type { Records } from './records';
import { accountingOutflow } from './summary';
import { MB, plurToBzz } from './units';

type Point = { x: number; y: number };
type LineDataset = ChartDataset<'line', Point[]>;

/**
 * Progress (MB) on the left axis; cost is plotted as spend-from-baseline
 * (deltas) on the right axis — absolute chequebook balance dwarfs the spend and
 * would flatten the curve.
 */
export async function renderChart(records: Records, outPath: string): Promise<void> {
  const datasets: LineDataset[] = [
    {
      label: 'MB downloaded',
      data: records.progressSamples.map((p) => ({ x: p.tMs / 1000, y: p.totalBytes / MB })),
      yAxisID: 'yBytes',
      borderColor: '#1f77b4',
      backgroundColor: '#1f77b4',
      pointRadius: 0,
      borderWidth: 2,
    },
  ];

  // Single total-cost curve: settled cheques + sub-threshold accounting outflow.
  // (Cheques-sent and chequebook-balance-drop are the same committed amount, so
  // plotting both just draws two coincident lines — we combine instead.)
  const chq = records.chequebookSamples;
  const hasCost = records.chequebookEnabled && chq.length > 0;
  const hasBzzAxis = hasCost;
  if (hasCost) {
    const chequeBase = BigInt(chq[0].totalChequesValuePlur);
    const balanceByT = new Map(records.balanceSamples.map((b) => [b.tMs, b] as const));
    datasets.push({
      label: 'BZZ spent (total)',
      data: chq.map((c) => {
        const chequeDelta = BigInt(c.totalChequesValuePlur) - chequeBase;
        const outflow = accountingOutflow(records.balanceSamples, balanceByT.get(c.tMs));
        return { x: c.tMs / 1000, y: plurToBzz(chequeDelta + outflow) };
      }),
      yAxisID: 'yBzz',
      borderColor: '#2ca02c',
      backgroundColor: '#2ca02c',
      pointRadius: 0,
      borderWidth: 2,
    });
  }

  const config: ChartConfiguration<'line', Point[]> = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: false,
      parsing: false,
      interaction: { mode: 'nearest' },
      plugins: {
        title: { display: true, text: `Swarm ${records.mode} download — progress & BZZ cost` },
        legend: { position: 'bottom' },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'seconds' } },
        yBytes: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'MB downloaded' },
          beginAtZero: true,
        },
        ...(hasBzzAxis
          ? {
              yBzz: {
                type: 'linear' as const,
                position: 'right' as const,
                title: { display: true, text: 'BZZ spent' },
                grid: { drawOnChartArea: false },
                beginAtZero: true,
              },
            }
          : {}),
      },
    },
  };

  const canvas = new ChartJSNodeCanvas({ width: 1200, height: 700, backgroundColour: 'white' });
  const buffer = await canvas.renderToBuffer(config as ChartConfiguration);
  await writeFile(outPath, buffer);
}
