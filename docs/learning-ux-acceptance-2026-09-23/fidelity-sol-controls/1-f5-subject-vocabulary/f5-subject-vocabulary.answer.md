Suppose a coin is either **fair** ($P(H)=0.5$) or **heads-biased** ($P(H)=0.75$), and you initially consider the two possibilities equally likely.

An **observation** is what you actually see: one toss lands heads. The **Bayesian evidence** is the probability of seeing heads *before you know which coin you have*:

$$P(\text{heads})=0.5(0.5)+0.5(0.75)=0.625.$$

That evidence accounts for both possibilities and normalizes the update. After the observation, the probability that the coin is heads-biased is $0.5(0.75)/0.625=0.6$, up from $0.5$.
