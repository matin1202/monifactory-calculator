import { Repository } from '../repository';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
let lpSolver = require('javascript-lp-solver');

// Register the actual solver as window.solver for tests
const globalAny:any = global;
globalAny.window = {
    solver: lpSolver
};

export type DataMode = 'normal' | 'hard';

export function dataPath(mode: DataMode = 'normal'): string {
    return path.join(process.cwd(), 'data', mode === 'hard' ? 'data-hard.bin' : 'data.bin');
}

// Hard mode data is optional until it has been exported; its tests are skipped when the file is missing.
export function hasData(mode: DataMode): boolean {
    return existsSync(dataPath(mode));
}

export async function setupRepository(mode: DataMode = 'normal') {
    const compressedData = await fs.readFile(dataPath(mode));
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        zlib.gunzip(compressedData, (err, decompressed) => {
            if (err) reject(err);
            else {
                const arrayBuffer = new ArrayBuffer(decompressed.length);
                const view = new Uint8Array(arrayBuffer);
                decompressed.copy(view);
                resolve(arrayBuffer);
            }
        });
    });

    Repository.load(buffer);
}
