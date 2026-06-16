const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
app.use(express.static(__dirname));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server: server });

// --- ゲームロジック（そのまま貼り付け）---
const WIDTH = 800;
const HEIGHT = 400;
const GROUND_Y = 350;

let p1 = createPlayer(150, 250);
let p2 = createPlayer(550, 250);
let matchMessage = "READY... FIGHT!";
let isGameOver = false;
let clients = [];

function createPlayer(x, y) {
    return { x, y, width: 50, height: 100, hp: 100, maxHp: 100, displayHp: 100, vx: 0, vy: 0, isGrounded: true, isFacingRight: true, isAttacking: false, attackTimer: 0, comboCount: 0, comboTimer: 0, hasProjectile: false, projX: 0, projY: 0, projVx: 0, keyLeft: false, keyRight: false, isParrying: false, parryTimer: 0 };
}

wss.on('connection', (ws) => {
    clients.push(ws);
    const role = clients.length === 1 ? 'SERVER' : 'CLIENT';
    ws.send(JSON.stringify({ type: 'init', role: role }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'input') {
            const player = role === 'SERVER' ? p1 : p2;
            if (isGameOver && data.key === 'R' && data.isDown) { resetGame(); return; }
            if (isGameOver) return;
            if (data.key === 'A') player.keyLeft = data.isDown;
            if (data.key === 'D') player.keyRight = data.isDown;
            if (data.isDown) {
                if (data.key === 'W' && player.isGrounded) { player.vy = -22; player.isGrounded = false; }
                if (data.key === 'SPACE' && !player.isAttacking) { player.isAttacking = true; }
                if (data.key === 'S' && !player.hasProjectile) { player.hasProjectile = true; player.projX = player.isFacingRight ? player.x + player.width : player.x - 20; player.projY = player.y + 30; player.projVx = player.isFacingRight ? 15 : -15; }
                if (data.key === 'PARRY' && !player.isParrying) { player.isParrying = true; player.parryTimer = 10; }
            }
        }
    });
    ws.on('close', () => { clients = clients.filter(c => c !== ws); });
});

function updatePlayer(p) {
    p.vy += 1.2; p.x += Math.round(p.vx); p.y += Math.round(p.vy);
    if (p.keyLeft) p.vx = -6; else if (p.keyRight) p.vx = 6;
    if (p.y >= GROUND_Y - p.height) { p.y = GROUND_Y - p.height; p.vy = 0; p.isGrounded = true; }
    p.vx *= 0.85; if (Math.abs(p.vx) < 0.1) p.vx = 0;
    if (p.x < 0) p.x = 0; if (p.x > WIDTH - p.width) p.x = WIDTH - p.width;
    if (p.isAttacking) { p.attackTimer++; if (p.attackTimer > 12) { p.isAttacking = false; p.attackTimer = 0; } }
    if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer === 0) p.comboCount = 0; }
    if (p.hasProjectile) { p.projX += p.projVx; if (p.projX < 0 || p.projX > WIDTH) p.hasProjectile = false; }
    if (p.displayHp > p.hp) { p.displayHp -= 0.5; if (p.displayHp < p.hp) p.displayHp = p.hp; }
    if (p.isParrying) { p.parryTimer--; if (p.parryTimer <= 0) p.isParrying = false; }
}

function checkCollisions() {
    if (p1.isAttacking && p1.attackTimer === 1) {
        if ((p1.isFacingRight && p1.x+p1.width+40 >= p2.x && p1.x+p1.width <= p2.x+p2.width) || (!p1.isFacingRight && p1.x-40 <= p2.x+p2.width && p1.x >= p2.x)) {
            if (p2.isParrying) { p1.vx = p1.isFacingRight ? -15 : 15; matchMessage = "P2 PARRIED!"; } else { applyDamageToP2(10, p1.isFacingRight ? 18 : -18); }
        }
    }
    // ... (省略: 残りの判定ロジックもここに入れる)
}

function applyDamageToP1(dmg, knockback) { p1.hp = Math.max(0, p1.hp - dmg); p1.vx = knockback; p2.comboCount++; p2.comboTimer = 45; if (p1.hp <= 0) { matchMessage = "PLAYER 2 WINS!"; isGameOver = true; } }
function applyDamageToP2(dmg, knockback) { p2.hp = Math.max(0, p2.hp - dmg); p2.vx = knockback; p1.comboCount++; p1.comboTimer = 45; if (p2.hp <= 0) { matchMessage = "PLAYER 1 WINS!"; isGameOver = true; } }

function broadcastState() {
    const state = JSON.stringify({ type: 'state', p1, p2, matchMessage, isGameOver });
    clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(state); });
}

setInterval(() => {
    if (clients.length === 2) {
        p1.isFacingRight = (p1.x < p2.x); p2.isFacingRight = (p2.x <= p1.x);
        updatePlayer(p1); updatePlayer(p2); checkCollisions();
    }
    broadcastState();
}, 16);

function resetGame() { p1 = createPlayer(150, 250); p2 = createPlayer(550, 250); matchMessage = "READY... FIGHT!"; isGameOver = false; }

// server.listen(80); // これを削除して、下のように変える
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`サーバー起動: ポート ${PORT}`));