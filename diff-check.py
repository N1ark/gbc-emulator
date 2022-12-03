import sys
from termcolor import colored


def parse(l: str):
    return {p[0]: p[1] for r in l.split("/") if len(p := r.split(":")) > 1}


def ranges(vals: list[int]) -> list[tuple[int, int]]:
    if not vals:
        return []
    ranges: list[tuple[int, int]] = []
    vals = sorted(vals)
    current: list[int] = [vals[0]]
    for i in vals[1:]:
        if i != current[-1] + 1:
            ranges.append((current[0], current[-1]))
            current = []
        current.append(i)
    ranges.append((current[0], current[-1]))
    return ranges


def diff_lines(line1: str, line2: str):
    pl1 = parse(line1)
    pl2 = parse(line2)
    return {
        k: {1: pl1[k], 2: pl2[k] if k in pl2.keys() else "(not set)"}
        for k in pl1.keys()
        if (k not in pl2.keys() or pl1[k] != pl2[k])
    }


def main(ignored: list[str] = [], limit: int = 64):
    with open("log_em1.txt", "r") as log1_file:
        log1 = log1_file.readlines()

    with open("log_em2.txt", "r") as log2_file:
        log2 = log2_file.readlines()

    if len(log1) != len(log2):
        print(f"Log lengths are different! {log1} / {log2}")
        return

    mistakes = []

    for i in range(len(log1)):
        l1, l2 = log1[i], log2[i]
        if l1 == l2:
            continue
        pl1 = parse(l1)
        pl2 = parse(l2)
        diff = {
            k: {1: pl1[k], 2: pl2[k] if k in pl2.keys() else "(not set)"}
            for k in pl1.keys()
            if (k not in pl2.keys() or pl1[k] != pl2[k]) and k not in ignored
        }
        if not diff:
            continue
        print(colored(f"diff on line {i}: {diff}", "red", attrs=["bold"]))
        for j in range(3):
            if i - (3 - j) < 0:
                continue
            prev_diff = diff_lines(log1[i-(3-j)], log2[i-(3-j)])
            print(f"Previous {3-j}: {log1[i-(3-j)]}", end="")
            if(prev_diff):
                print(f"\tdiff was: {prev_diff}")
        print(colored(f"Emulator 1: {l1}", "red"), end="")
        print(colored(f"Emulator 2: {l2}", "green"))
        mistakes += [i]
        if len(mistakes) > limit:
            print("ending because too many mistakes")
            break

    if len(mistakes) == 0:
        print("no mistakes found! celebrate!")
    else:
        mis_ranges = ranges(mistakes)
        print(
            "mistakes are",
            ", ".join(
                [str(r[0]) if r[0] == r[1] else f"{r[0]}..{r[1]}" for r in mis_ranges]
            ),
        )

def find_arg(name: str):
    for a in sys.argv:
        if a.startswith(f"--{name}="):
            return a.replace(f"--{name}=", "")
    return None

if __name__ == "__main__":
    kwargs = {}
    if ignored := find_arg("i"):
        kwargs["ignored"] = ignored.split(",")
    if limit := find_arg("l"):
        kwargs["limit"] = int(limit)
    main(**kwargs)
