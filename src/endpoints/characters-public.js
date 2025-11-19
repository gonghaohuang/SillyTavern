import path from 'node:path';
import fs from 'node:fs';

import express from 'express';

import { DEFAULT_USER } from '../constants.js';
import { getUserDirectories } from '../users.js';
import { processCharacter } from './characters.js';

export const router = express.Router();

/**
 * Resolves which user directories to use for public character queries.
 * - If the request is already associated with a user (normal ST session), use that user's directories.
 * - Otherwise, fall back to the default user.
 *
 * This allows these endpoints to be called without passing the login middleware,
 * while still returning meaningful character data.
 *
 * @param {import('express').Request} request
 * @returns {import('../users.js').UserDirectoryList}
 */
function getDirectoriesForRequest(request) {
    if (request.user?.directories) {
        return request.user.directories;
    }

    return getUserDirectories(DEFAULT_USER.handle);
}

/**
 * GET /api/public/characters/all
 *
 * Returns all characters for the resolved user (current session user if available,
 * otherwise the default user). This is a read‑only, unauthenticated‑friendly
 * endpoint intended for external services that treat SillyTavern as a character
 * repository.
 */
router.get('/all', async function (request, response) {
    try {
        const directories = getDirectoriesForRequest(request);
        const files = fs.readdirSync(directories.characters);
        const pngFiles = files.filter(file => file.endsWith('.png'));

        const processingPromises = pngFiles.map(file => processCharacter(file, directories, { shallow: false }));
        const data = (await Promise.all(processingPromises)).filter(c => c.name);

        return response.send(data);
    } catch (error) {
        console.error('Public characters/all failed:', error);
        return response.status(500).send({ error: true });
    }
});

/**
 * GET /api/public/characters/:avatar
 *
 * Returns a single character by avatar filename (e.g. "MyChar.png") for the
 * resolved user (current session user if available, otherwise the default user).
 */
router.get('/:avatar', async function (request, response) {
    try {
        const directories = getDirectoriesForRequest(request);
        const item = request.params.avatar;
        const filePath = path.join(directories.characters, item);

        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        const data = await processCharacter(item, directories, { shallow: false });
        return response.send(data);
    } catch (error) {
        console.error('Public characters/:avatar failed:', error);
        return response.status(500).send({ error: true });
    }
});


