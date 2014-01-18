REM requires https://developers.google.com/closure/compiler/ 
"C:\Program Files\Java\jre7\bin\java.exe" -jar ../lib/compiler.jar --compilation_level=SIMPLE_OPTIMIZATIONS --js=../src/core.js --js_output_file=../sqe.library.min.js

"C:\Program Files\Java\jre7\bin\java.exe" -jar ../lib/compiler.jar --compilation_level=WHITESPACE_ONLY --formatting=pretty_print --js=../src/core.js --js_output_file=../sqe.library.js
