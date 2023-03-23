#!/bin/bash

/usr/bin/find . -name *.drawio -exec rm -f {}.pdf \; -exec /Applications/draw.io.app/Contents/MacOS/draw.io --crop -x -o {}.pdf {} \;
