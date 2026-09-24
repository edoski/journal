<!-- learning-session:01a0be3f-4e65-7385-8aa5-69038deff4d6 -->
<!-- learning-lesson:{"title":"Exercise 7"} -->

## Exercise 7

Correction noted: the “determinant zero means no solutions” idea was not your independent conclusion; it came from the old tutor. Your actual progress was after the hint: subtracting twice the first equation gave $0=0$.

Conceptually, $0=0$ means the second equation adds no new restriction. So the system really has only one independent condition, $x+y=2$, which describes a whole line of points, not a single point. That is why there are infinitely many solutions.

Your parameter idea matches this:

$$
x \text{ can be chosen freely}, \qquad y=2-x.
$$

So every choice of $x$ gives one solution point on the line. Next time we can finish by checking this parameterization in both equations.

---

- Determinant zero means the equations are dependent in direction, so the lines are either the same line or parallel distinct lines; it does not tell which. Same line gives infinitely many solutions, parallel distinct lines gives no solutions.

- Our parameterization is: choose $x=t$ freely, then $y=2-t$, so the solutions are $(t,\,2-t)$.

---

## Exercise 7

Conceptually, we have established that the two equations describe the same line, so one free parameter is enough to describe all solutions.

With your check,

$$
x=t,\qquad y=2-t
$$

gives

$$
x+y=t+(2-t)=2
$$

and

$$
2x+2y=2t+2(2-t)=4
$$

for every real $t$. So Exercise 7 is finished: the system has infinitely many solutions, parameterized by $(t,\,2-t)$. Exercise 8 remains for another time.

---

## Exercise 7 clarification

Conceptually, the second equation is just twice the first, so both equations describe the same line. That means every point on

$$
x+y=2
$$

is a solution.

The parameterization is:

$$
x=t,\qquad y=2-t,\qquad t\in\mathbb R
$$

Check in the original equations:

$$
x+y=t+(2-t)=2
$$

so the first equation is satisfied.

$$
2x+2y=2t+2(2-t)=2t+4-2t=4
$$

so the second equation is also satisfied.

Therefore,

$$
(x,y)=(t,2-t),\qquad t\in\mathbb R
$$

gives all solutions to Exercise 7.

---

## Exercise 8

Conceptually, this one is different from Exercise 7: the left side of the second equation is twice the left side of the first, but the right side is **not** twice as large.

The system is:

$$
x+y=2
$$

$$
2x+2y=5
$$

If we double the first equation, we get:

$$
2x+2y=4
$$

But the second equation says:

$$
2x+2y=5
$$

So the same quantity would have to equal both $4$ and $5$, which is impossible.

Therefore Exercise 8 is an **inconsistent system**: it has **no solutions**.

---
