echo "BUILDING"
docker-compose build

echo "TAGGING"
docker tag tms_web totalplatform/tms:latest

echo "PUSHING"
docker push totalplatform/tms:latest

echo "DONE"