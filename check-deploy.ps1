Write-Host "Solver is live at: https://timetable-solver-production-dd4f.up.railway.app"
Write-Host "Health check:"
curl.exe -s "https://timetable-solver-production-dd4f.up.railway.app/health"
