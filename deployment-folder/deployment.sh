RESOURCE_GROUP="rg-flask-ml-predictor"
CONTAINER_APP_NAME="flask-ml-predictor"
ACR_NAME="mlpredictorregistry2025"
IMAGE_NAME="flask-ml-app"
TAG="v5" 

docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG .

az acr login --name $ACR_NAME
docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG

az containerapp update \
    --name $CONTAINER_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG

echo "Deployment complete! Getting app URL..."
az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn --output tsv