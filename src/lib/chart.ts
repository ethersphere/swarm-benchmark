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

  const balances = records.balanceSamples;
  if (balances.length > 0) {
    datasets.push({
      label: 'Retrieval spend — accounting (BZZ)',
      data: balances.map((b) => ({ x: b.tMs / 1000, y: plurToBzz(accountingOutflow(balances, b)) })),
      yAxisID: 'yBzz',
      borderColor: '#9467bd',
      backgroundColor: '#9467bd',
      pointRadius: 0,
      borderWidth: 2,
    });
  }

  const hasChequebook = records.chequebookEnabled && records.chequebookSamples.length > 0;
  const hasBzzAxis = hasChequebook || balances.length > 0;
  if (hasChequebook) {
    const chq = records.chequebookSamples;
    const availBase = BigInt(chq[0].availableBalancePlur);
    const chequeBase = BigInt(chq[0].totalChequesValuePlur);
    datasets.push({
      label: 'Cheques sent — spend (BZZ)',
      data: chq.map((c) => ({ x: c.tMs / 1000, y: plurToBzz(BigInt(c.totalChequesValuePlur) - chequeBase) })),
      yAxisID: 'yBzz',
      borderColor: '#2ca02c',
      backgroundColor: '#2ca02c',
      pointRadius: 0,
      borderWidth: 2,
    });
    datasets.push({
      label: 'Chequebook balance drop (BZZ)',
      data: chq.map((c) => ({ x: c.tMs / 1000, y: plurToBzz(availBase - BigInt(c.availableBalancePlur)) })),
      yAxisID: 'yBzz',
      borderColor: '#d62728',
      backgroundColor: '#d62728',
      pointRadius: 0,
      borderWidth: 2,
      borderDash: [6, 4],
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
