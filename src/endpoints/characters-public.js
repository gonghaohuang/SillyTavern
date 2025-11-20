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
    // 1. 显式指定的用户名（优先级最高）
    //    支持通过 query: ?user=<handle> 或 Header: x-st-user: <handle> 传入
    let userHandle = request.query.user ?? request.headers['x-st-user'];

    // 如果是数组（例如多值 query），只取第一个
    if (Array.isArray(userHandle)) {
        userHandle = userHandle[0];
    }

    if (typeof userHandle === 'string' && userHandle.trim().length > 0) {
        try {
            return getUserDirectories(userHandle.trim());
        } catch (error) {
            // 如果显式用户名解析失败，打印日志后继续走后续逻辑
            // eslint-disable-next-line no-console
            console.error('Public characters: failed to resolve user directories for handle', userHandle, error);
        }
    }

    // 2. 已登录用户
    if (request.user?.directories) {
        return request.user.directories;
    }

    // 3. 默认用户
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


