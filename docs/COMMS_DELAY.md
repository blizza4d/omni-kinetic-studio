# Earth-Moon Comms Delay Mode Specification (Pack E — F-005)

## 1. Physical Principle & Orbital Mechanics
Radio signals travel in vacuum at the speed of light $c \approx 299,792\text{ km/s}$. At the mean Earth-Moon distance of $384,400\text{ km}$:

$$t_{\text{one-way}} = \frac{384,400\text{ km}}{299,792\text{ km/s}} \approx 1.282\text{ s}$$
$$t_{\text{RTT}} = 2 \cdot t_{\text{one-way}} \approx 2.564\text{ s}$$

Direct teleoperation from Earth is fundamentally subject to this $2.56\text{s}$ round-trip latency. Commands issued by the operator take $1.28\text{s}$ to arrive at the lunar surface, and telemetry feedback takes another $1.28\text{s}$ to return.

---

## 2. DelayLine Architecture
Commands are buffered in a monotonic sim-time `DelayLine<T>`:

```typescript
export class DelayLine<T> {
  public push(nowSec: number, value: T): void;
  public pop(nowSec: number): T | undefined;
  public getInFlightCount(): number;
}
```

- **Replay Determinism:** Because the delay line keys releases strictly on simulation time ($t_{\text{sim}}$) rather than wall-clock time, recorded runs replay bit-identically across varying client frame rates.
- **Monotonic Delivery:** Late packets are never delivered out of sequence; older commands that expired while paused or buffered are cleared or fast-forwarded monotonically.

---

## 3. Comms Presets
1. **Direct Sim / Off (`off`):** $0.0\text{ s}$ delay. Standard real-time interactive manual control.
2. **Low Earth Orbit (`leo`):** $0.10\text{ s}$ RTT ($0.05\text{ s}$ each way). Models satellite constellation relay.
3. **Earth-Moon Direct (`moon`):** $2.56\text{ s}$ RTT ($1.28\text{ s}$ each way). Realistic lunar mission operations.
4. **Custom Latency (`custom`):** User-configurable one-way flight delay ($0.05\text{s}$ to $5.0\text{s}$).
