import express, { type Request, type Response } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

const allowedOrigins = [
    'http://localhost:3000',
]

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

const PORT = process.env.PORT ? Number(process.env.PORT) || 4001 : 4001;

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
})

const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, credentials: true },
});

io.on("connection", (socket) => {
    socket.on("request-grid", async () => {
        const blocks = await prisma.gridBlock.findMany();
        socket.emit("grid-state", blocks);
    });

    socket.on("book-block", async ({ blockId, userEmail }) => {
        const block = await prisma.gridBlock.findUnique({ where: { blockId } });
        if (block?.occupied) {
            socket.emit("error", { message: "Block already occupied" });
            return;
        }

        const updated = await prisma.gridBlock.update({
            where: { blockId },
            data: { occupied: true, owner: userEmail },
        });

        await prisma.ownership.create({
            data: { blockId, owner: userEmail, boughtAt: new Date() },
        });

        io.emit("block-updated", updated);

        io.emit("activity", {
            id: Date.now().toString(),
            action: "booked",
            userEmail,
            blockId,
            timestamp: Date.now(),
        });
    });

    socket.on("sell-block", async ({ blockId, userEmail }) => {
        const block = await prisma.gridBlock.findUnique({ where: { blockId } });
        if (block?.owner !== userEmail) {
            socket.emit("error", { message: "You do not own this block" });
            return;
        }

        const updated = await prisma.gridBlock.update({
            where: { blockId },
            data: { occupied: false, owner: null },
        });

        await prisma.ownership.update({
            where: { blockId },
            data: { soldAt: new Date() },
        });

        io.emit("block-updated", updated);

        io.emit("activity", {
            id: Date.now().toString(),
            action: "sold",
            userEmail,
            blockId,
            timestamp: Date.now(),
        });
    });
})

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})