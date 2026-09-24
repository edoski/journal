What changes is mainly the **default model and notation**:

- Treat the current lab as **discrete time**, so signals are indexed like $x[n]$, and the impulse response should be written as $g[n]$.
- Do **not** use the old lab sheets to decide current time convention; they assume **continuous time**, e.g. $g(t)$.
- Use **Lumen** for current course conventions.
- Use **Atlas** for derivations, but translate notation where needed, especially if Atlas writes the impulse response as $h$ instead of $g$.

So a continuous-time convolution form from an old sheet,

$$
y(t)=\int_{-\infty}^{\infty} x(\tau)g(t-\tau)\,d\tau
$$

should become the discrete-time current-lab form,

$$
y[n]=\sum_{k=-\infty}^{\infty} x[k]g[n-k].
$$

This is a convention/source correction, not evidence that you’ve learnt the maths.
