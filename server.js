const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const app = express();

app.use(express.static(__dirname));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server: server });

const WIDTH = 800, HEIGHT = 400, GROUND_Y = 350;
let p1 = createPlayer(150, 250), p2 = createPlayer(550, 250);
let matchMessage = "READY... FIGHT!", isGameOver = false;
let connectedClients = [null, null];

function createPlayer(x, y) {
    return { x, y, width: 50, height: 100, hp: 100, vx: 0, vy: 0, isGrounded: true, isFacingRight: true, isAttacking: false, attackTimer: 0, comboCount: 0, comboTimer: 0, hasProjectile: false, projX: 0, projY: 0, projVx: 0, keyLeft: false, keyRight: false, isParrying: false, parryTimer: 0, dashGauge: 100, isStunned: false, stunTimer: 0, isDashing: false };
}

wss.on('connection', (ws) => {
    let slot = connectedClients.findIndex(c => c === null);
    if (slot === -1) { ws.close(); return; }
    connectedClients[slot] = ws;
    ws.send(JSON.stringify({ type: 'init', role: (slot === 0) ? 'SERVER' : 'CLIENT' }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'input') {
            const p = (slot === 0) ? p1 : p2;
            if (isGameOver && data.key === 'R' && data.isDown) { resetGame(); return; }
            if (isGameOver) return;

            if (data.key === 'A') p.keyLeft = data.isDown;
            if (data.key === 'D') p.keyRight = data.isDown;
            if (data.key === 'SHIFT') p.isDashing = data.isDown;

            if (data.isDown) {
                if (data.key === 'W' && p.isGrounded) { p.vy = -22; p.isGrounded = false; }
                // 攻撃キャンセル処理：攻撃中に再度押すと硬直解除
                if (data.key === 'SPACE') {
                    if (p.isAttacking && p.attackTimer < 6) p.attackTimer = 0;
                    else if (!p.isAttacking) p.isAttacking = true;
                }
                if (data.key === 'S' && !p.hasProjectile) { 
                    p.hasProjectile = true; p.projX = p.isFacingRight ? p.x + p.width : p.x - 20; 
                    p.projY = p.y + 30; p.projVx = p.isFacingRight ? 15 : -15; 
                }
                if (data.key === 'PARRY' && !p.isParrying) { p.isParrying = true; p.parryTimer = 15; }
            }
        }
    });
    ws.on('close', () => { connectedClients[slot] = null; });
});

function updatePlayer(p) {
    if (p.isStunned) { p.stunTimer--; if (p.stunTimer <= 0) p.isStunned = false; }
    else {
        p.dashGauge = Math.min(100, p.dashGauge + 0.3);
        if (p.isDashing && p.dashGauge > 0) { p.dashGauge -= 1.5; p.vx = (p.keyLeft ? -12 : (p.keyRight ? 12 : 0)); }
        else { if (p.keyLeft) p.vx = -6; else if (p.keyRight) p.vx = 6; p.vx *= 0.85; }
        p.vy += 1.2; p.x += Math.round(p.vx); p.y += Math.round(p.vy);
    }
    if (p.y >= GROUND_Y - p.height) { p.y = GROUND_Y - p.height; p.vy = 0; p.isGrounded = true; }
    if (p.x < 0) p.x = 0; if (p.x > WIDTH - p.width) p.x = WIDTH - p.width;
    if (p.isAttacking) { p.attackTimer++; if (p.attackTimer > 12) { p.isAttacking = false; p.attackTimer = 0; } }
    if (p.hasProjectile) { p.projX += p.projVx; if (p.projX < 0 || p.projX > WIDTH) p.hasProjectile = false; }
    if (p.isParrying) { p.parryTimer--; if (p.parryTimer <= 0) p.isParrying = false; }
    if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer === 0) p.comboCount = 0; }
}

function applyDamage(target, dmg, kb, attacker) {
    target.hp = Math.max(0, target.hp - dmg);
    target.vx = attacker.isFacingRight ? kb : -kb;
    target.isStunned = true; target.stunTimer = 20;
    attacker.comboCount++; attacker.comboTimer = 60;
    if (target.hp <= 0) { isGameOver = true; matchMessage = (attacker === p1 ? "P1 WINS!" : "P2 WINS!"); }
}

function checkCollisions() {
    p1.isFacingRight = (p1.x < p2.x); p2.isFacingRight = (p2.x < p1.x);
    [ { atk: p1, def: p2 }, { atk: p2, def: p1 } ].forEach(d => {
        if (d.atk.isAttacking && d.atk.attackTimer === 1) {
            let hit = d.atk.isFacingRight ? (d.atk.x + d.atk.width + 40 >= d.def.x && d.atk.x + d.atk.width <= d.def.x + d.def.width) : (d.atk.x - 40 <= d.def.x + d.def.width && d.atk.x >= d.def.x);
            if (hit) {
                if (d.def.isParrying) { d.atk.vx = d.atk.isFacingRight ? -25 : 25; d.atk.isStunned = true; d.atk.stunTimer = 40; matchMessage = "PARRIED!"; }
                else { applyDamage(d.def, 10, 15, d.atk); }
            }
        }
        if (d.atk.hasProjectile && d.atk.projX > d.def.x && d.atk.projX < d.def.x + d.def.width && d.atk.projY > d.def.y && d.atk.projY < d.def.y + d.def.height) {
            d.atk.hasProjectile = false; applyDamage(d.def, 5, 5, d.atk);
        }
    });
}

function resetGame() { p1 = createPlayer(150, 250); p2 = createPlayer(550, 250); matchMessage = "READY... FIGHT!"; isGameOver = false; }
setInterval(() => { updatePlayer(p1); updatePlayer(p2); checkCollisions(); connectedClients.forEach(c => { if(c && c.readyState === 1) c.send(JSON.stringify({ type: 'state', p1, p2, matchMessage, isGameOver })); }); }, 16);
server.listen(8000);