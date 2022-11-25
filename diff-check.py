from termcolor import colored


def parse(l: str):
    parts = l.split("/")
    return {p[0]: p[1] for r in parts if len(p := r.split(":")) > 1}


def main():

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
            if k not in pl2.keys() or pl1[k] != pl2[k]
        }
        print(colored(f"diff on line {i}: {diff}", "red", attrs=["bold"]))
        for j in range(3):
            if i - (3 - j) < 0:
                continue
            print(f"Previous {3-j}: {log1[i-(3-j)]}", end="")
        print(colored(f"Emulator 1: {l1}", "red"), end="")
        print(colored(f"Emulator 2: {l2}", "green"))
        mistakes += [i]
        if len(mistakes) > 64:
            print("ending because too many mistakes")
            print("mistake lines are", mistakes)
            return

    if len(mistakes) == 0:
        print("no mistakes found! celebrate!")


if __name__ == "__main__":
    main()
